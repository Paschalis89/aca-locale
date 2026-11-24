#!/usr/bin/env python3
"""Read-only Shopify SQLite recovery drill from a verified production backup."""
import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys
import tarfile
import tempfile

STAMP = re.compile(r'^aca-locale-(\d{8}T\d{6}Z)\.sha256$')

def fail(message):
    raise ValueError(message)

def verify(manifest: Path, backup_dir: Path):
    if manifest.parent.resolve() != backup_dir.resolve():
        fail('manifest outside backup directory')
    m = STAMP.fullmatch(manifest.name)
    if not m:
        fail('unexpected manifest name')
    stamp = m.group(1)
    db = backup_dir / f'aca-locale-postgres-{stamp}.dump'
    sessions = backup_dir / f'aca-locale-shopify-session-{stamp}.tar.gz'
    expected = {str(db.resolve()), str(sessions.resolve())}
    if not all(x.is_file() and not x.is_symlink() for x in (manifest, db, sessions)):
        fail('missing or symlinked backup artifact')
    found = set()
    for line in manifest.read_text(encoding='utf8').splitlines():
        if not re.fullmatch(r'[a-fA-F0-9]{64}  /[^\n]+', line):
            fail('malformed checksum line')
        hash_hex, name = line[:64], line[66:]
        if name not in expected or name in found:
            fail('unexpected or repeated checksum entry')
        found.add(name)
        digest = hashlib.sha256()
        with open(name, 'rb') as src:
            for chunk in iter(lambda: src.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest().lower() != hash_hex.lower():
            fail('backup checksum mismatch')
    if found != expected:
        fail('incomplete checksum manifest')
    print('[PASS] exact backup pair and SHA-256 checksums')
    return sessions

def inspect_sessions(archive: Path):
    # Refuse traversal, special files, symlinks, duplicate names and unexpectedly huge files.
    with tarfile.open(archive, 'r:gz') as tar:
        regular = []
        seen = set()
        for info in tar:
            name = PurePosixPath(info.name)
            if name.is_absolute() or '..' in name.parts or info.name in seen:
                fail('unsafe or duplicate tar member')
            seen.add(info.name)
            if not info.isfile() and not info.isdir():
                fail('unsupported archive member type')
            if info.isfile():
                if info.size > 512 * 1024 * 1024:
                    fail('archive member exceeds safety size limit')
                regular.append(info)
        matches = [i for i in regular if PurePosixPath(i.name).name == 'shopify-session.sqlite']
        if len(matches) != 1:
            fail('expected exactly one shopify-session.sqlite in backup')
        member = matches[0]
        with tempfile.TemporaryDirectory(prefix='aca-session-rc-') as tmp:
            dest = Path(tmp) / 'session.sqlite'
            with tar.extractfile(member) as inp, dest.open('wb') as out:
                while True:
                    chunk = inp.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            # Read-only DB URI, never touch original volume or active connection.
            con = sqlite3.connect(f'{dest.as_uri()}?mode=ro', uri=True)
            try:
                result = con.execute('PRAGMA integrity_check').fetchone()
                if not result or result[0] != 'ok':
                    fail('SQLite integrity_check failed')
                names = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if 'Session' not in names:
                    fail('Shopify Session table missing')
                cols = {row[1] for row in con.execute('PRAGMA table_info("Session")')}
                if not {'id', 'shop'}.issubset(cols):
                    fail('Shopify session schema missing id/shop')
                count = con.execute('SELECT COUNT(*) FROM "Session"').fetchone()[0]
                print('[PASS] extracted SQLite integrity_check: ok')
                print('[PASS] Shopify session schema: id/shop present')
                print(f'[INFO] session rows: {count} (no session data emitted)')
                print('[PASS] isolated session recovery drill; production volume unchanged')
            finally:
                con.close()

def main(argv=None):
    p = argparse.ArgumentParser(description='Read-only ACA Locale Shopify session recovery drill')
    p.add_argument('--backup-dir', default=os.environ.get('ACA_LOCALE_BACKUP_DIR', '/var/backups/aca-locale'))
    p.add_argument('--manifest', help='Specific backup manifest under backup-dir')
    args = p.parse_args(argv)
    backup_dir = Path(args.backup_dir).resolve()
    if not backup_dir.is_dir():
        fail('backup directory not found')
    if args.manifest:
        manifest = Path(args.manifest).absolute()
    else:
        matches = sorted((p for p in backup_dir.iterdir() if STAMP.fullmatch(p.name)), reverse=True)
        if not matches:
            fail('no backup manifest found')
        manifest = matches[0]
    sessions = verify(manifest, backup_dir)
    inspect_sessions(sessions)

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError) as exc:
        print(f'[FAIL] {exc}', file=sys.stderr)
        sys.exit(1)
