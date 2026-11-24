"""Offline safety tests for ACA Locale isolated restore drill."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'operations' / 'aca-restore-drill.sh'
STAMP = '20261124T170000Z'


class RestoreDrillTests(unittest.TestCase):
    def run_script(self, *args, env=None):
        return subprocess.run(['bash', str(SCRIPT), *args], capture_output=True,
                              text=True, env=env, timeout=10)

    def test_help(self):
        result = self.run_script('--help')
        self.assertEqual(result.returncode, 0)
        self.assertIn('isolated', result.stdout)

    def test_rejects_unknown_argument(self):
        result = self.run_script('--unsafe')
        self.assertEqual(result.returncode, 2)

    def test_rejects_missing_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, 'ACA_LOCALE_BACKUP_DIR': tmp}
            result = self.run_script(env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('no backup manifests', result.stderr)

    def test_rejects_unexpected_manifest_entries_before_docker(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            db = path / f'aca-locale-postgres-{STAMP}.dump'
            session = path / f'aca-locale-shopify-session-{STAMP}.tar.gz'
            manifest = path / f'aca-locale-{STAMP}.sha256'
            db.write_bytes(b'PGDMPnot-a-real-dump')
            session.write_bytes(b'not-a-tar')
            unrelated = path / 'unrelated.txt'
            unrelated.write_bytes(b'not-related')
            lines = []
            for f in (db, session, unrelated):
                lines.append(f'{hashlib.sha256(f.read_bytes()).hexdigest()}  {f}')
            manifest.write_text('\n'.join(lines) + '\n')
            env = {**os.environ, 'ACA_LOCALE_BACKUP_DIR': tmp}
            result = self.run_script(env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('unexpected/duplicate', result.stderr)

    def test_rejects_checksum_mismatch_before_docker(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            db = path / f'aca-locale-postgres-{STAMP}.dump'
            session = path / f'aca-locale-shopify-session-{STAMP}.tar.gz'
            manifest = path / f'aca-locale-{STAMP}.sha256'
            db.write_bytes(b'PGDMPexample')
            session.write_bytes(b'example')
            manifest.write_text(''.join(f'{"0"*64}  {f}\n' for f in (db, session)))
            env = {**os.environ, 'ACA_LOCALE_BACKUP_DIR': tmp}
            result = self.run_script(env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('checksum mismatch', result.stderr)

    def test_never_targets_running_production(self):
        source = SCRIPT.read_text()
        self.assertIn('--network none', source)
        self.assertIn('pg_restore -U postgres -d postgres', source)
        self.assertNotIn('docker compose down', source)
        self.assertNotIn('docker compose stop', source)
        self.assertNotIn('CONFIRM_RESTORE', source)
        self.assertIn('trap cleanup EXIT', source)


if __name__ == '__main__':
    unittest.main()
