#!/usr/bin/env python3
"""Offline contract tests; no Docker daemon, network, database, or production access."""
import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'operations' / 'aca-ops-health.sh'
MOCK_DOCKER = r'''#!/usr/bin/env bash
set -e
if [[ "$1" == "compose" ]]; then
  for arg in "$@"; do
    if [[ "$arg" == "ps" ]]; then
      service="${@: -1}"
      if [[ "$service" == "web" && "${MOCK_WEB_MISSING:-0}" == 1 ]]; then exit 0; fi
      printf 'mock-%s\n' "$service"
      exit 0
    fi
    if [[ "$arg" == "exec" ]]; then
      cat >/dev/null
      printf '%s\n' 'jobs_failed|0' 'jobs_stale_running|0' 'jobs_due_retry|1' 'webhooks_failed|0' 'webhooks_stale_processing|0' 'items_failed|0' 'usage_errors_24h|0'
      exit 0
    fi
  done
fi
if [[ "$1" == inspect ]]; then
  if [[ " $* " == *'.State.Status'* ]]; then echo running
  elif [[ "${@: -1}" == mock-traefik ]]; then echo no-healthcheck
  else echo healthy; fi
  exit 0
fi
exit 2
'''

class HealthScriptTest(unittest.TestCase):
    def run_case(self, extra_env=None, args=()):
        with tempfile.TemporaryDirectory() as tmp:
            base = pathlib.Path(tmp)
            (base / 'deploy').mkdir()
            (base / 'deploy' / '.env.production').write_text('DUMMY=1\n')
            (base / 'docker-compose.production.yml').write_text('services: {}\n')
            (base / 'backups').mkdir()
            (base / 'mockbin').mkdir()
            docker = base / 'mockbin' / 'docker'
            docker.write_text(MOCK_DOCKER)
            docker.chmod(0o755)
            env = dict(os.environ, PATH=str(base / 'mockbin') + ':' + os.environ['PATH'],
                       ACA_LOCALE_ROOT=str(base), ACA_LOCALE_BACKUP_DIR=str(base / 'backups'))
            env.update(extra_env or {})
            return subprocess.run(['bash', str(SCRIPT), *args], env=env,
                                  capture_output=True, text=True, timeout=10)

    def test_healthy_services_and_db_counts(self):
        result = self.run_case()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn('web: running (healthy)', result.stdout)
        self.assertIn('jobs_due_retry: 1', result.stdout)
        self.assertIn('no SHA-256 backup manifest found', result.stdout)

    def test_missing_web_is_critical(self):
        result = self.run_case({'MOCK_WEB_MISSING': '1'}, ['--skip-db'])
        self.assertEqual(result.returncode, 1)
        self.assertIn('web: container absent', result.stdout)
        self.assertIn('Database queries skipped', result.stdout)

    def test_bad_threshold_fails_closed(self):
        result = self.run_case({'ACA_MAX_JOB_AGE_MINUTES': '1; echo hacked'})
        self.assertEqual(result.returncode, 2)
        self.assertIn('invalid MAX_JOB_AGE_MINUTES', result.stderr)
        self.assertNotIn('hacked\n', result.stdout)

    def test_unknown_argument_is_rejected(self):
        self.assertEqual(self.run_case(args=['--publish']).returncode, 2)

if __name__ == '__main__':
    unittest.main()
