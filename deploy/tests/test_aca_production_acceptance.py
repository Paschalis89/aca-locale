import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'acceptance' / 'aca-production-acceptance.sh'

class ProductionAcceptanceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.code = SCRIPT.read_text()

    def test_bash_syntax(self):
        self.assertEqual(subprocess.run(['bash', '-n', str(SCRIPT)], capture_output=True).returncode, 0)

    def test_help_is_safe_without_docker(self):
        r = subprocess.run(['bash', str(SCRIPT), '--help'], text=True, capture_output=True)
        self.assertEqual(r.returncode, 0)
        self.assertIn('Read-only', r.stdout)

    def test_unknown_flag_rejected(self):
        r = subprocess.run(['bash', str(SCRIPT), '--not-an-option'], text=True, capture_output=True)
        self.assertEqual(r.returncode, 2)

    def test_no_destructive_commands(self):
        for forbidden in ('docker compose down', 'docker rm', 'docker run', 'pg_restore', 'psql ', 'git reset', 'git clean', 'curl -X POST'):
            self.assertNotIn(forbidden, self.code)

    def test_required_acceptance_gates(self):
        for marker in ('health/live', 'health/ready', 'operations/snapshot', 'translations/jobs', 'aca-ops-health.sh', 'ACA_ACCEPTANCE_EXPECT_COMMIT'):
            self.assertIn(marker, self.code)

    def test_all_services_checked(self):
        self.assertIn('web backend postgres redis traefik', self.code)

if __name__ == '__main__':
    unittest.main()
