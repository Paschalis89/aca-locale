import hashlib
import io
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'rc'
SCRIPT = ROOT / 'aca-session-recovery-drill.py'
ROLLBACK = ROOT / 'aca-rollback-preflight.sh'

class RecoveryDrill(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name)
        self.stamp = '20261124T165941Z'
        self.db = self.p / f'aca-locale-postgres-{self.stamp}.dump'
        self.session = self.p / f'aca-locale-shopify-session-{self.stamp}.tar.gz'
        self.manifest = self.p / f'aca-locale-{self.stamp}.sha256'
        self.db.write_bytes(b'PGDMP demo')
        sqlite_file = self.p / 'store.sqlite'
        con = sqlite3.connect(sqlite_file)
        con.execute('CREATE TABLE Session (id TEXT PRIMARY KEY, shop TEXT NOT NULL)')
        con.execute("INSERT INTO Session VALUES ('test', 'test.myshopify.com')")
        con.commit()
        con.close()
        with tarfile.open(self.session, 'w:gz') as tar:
            tar.add(sqlite_file, arcname='./shopify-session.sqlite')
        self.write_manifest()
    def write_manifest(self):
        self.manifest.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p}\n' for p in (self.db, self.session)))
    def run_drill(self):
        return subprocess.run(['python3', str(SCRIPT), '--backup-dir', str(self.p)], text=True, capture_output=True)
    def test_valid_session_restore(self):
        proc = self.run_drill()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('session rows: 1', proc.stdout)
        self.assertNotIn('test.myshopify.com', proc.stdout)
    def test_rejects_corruption(self):
        self.session.write_bytes(self.session.read_bytes() + b'evil')
        self.assertNotEqual(self.run_drill().returncode, 0)
    def test_rejects_missing_archive(self):
        self.session.unlink()
        self.assertNotEqual(self.run_drill().returncode, 0)
    def test_rejects_unexpected_manifest_entry(self):
        self.manifest.write_text(self.manifest.read_text() + '0'*64 + '  /tmp/unexpected\n')
        self.assertNotEqual(self.run_drill().returncode, 0)
    def test_rejects_path_traversal(self):
        with tarfile.open(self.session, 'w:gz') as tar:
            data = b'malicious'
            info = tarfile.TarInfo('../shopify-session.sqlite')
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        self.write_manifest()
        self.assertNotEqual(self.run_drill().returncode, 0)
    def test_rollback_preflight_is_nonmutating(self):
        body = ROLLBACK.read_text()
        for cmd in ('docker compose down', 'docker tag ', 'git reset', 'pg_restore ', 'docker rm ', 'docker run '):
            self.assertNotIn(cmd, body)
        proc = subprocess.run(['bash', str(ROLLBACK), '--help'], text=True, capture_output=True)
        self.assertEqual(proc.returncode, 0)

if __name__ == '__main__':
    unittest.main()
