#!/usr/bin/env bash
set -euo pipefail

# Offline quality gate: no production API calls or database writes.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -f backend/package.json || ! -f backend/test/rc-security-resilience.spec.ts ]]; then
  echo '[FAIL] Missing backend source or RC tests'; exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo '[FAIL] npm is required'; exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no | grep -E '^.[DU]|^U' || true)" ]]; then
  echo '[FAIL] Unmerged changes detected'; exit 1
fi
printf '[INFO] Git revision: '; git rev-parse --short HEAD
printf '\n== RC isolated tenant/webhook tests ==\n'
(cd backend && npx vitest run test/rc-security-resilience.spec.ts src/internal/internal-translation-change.service.spec.ts)
printf '\n== Full backend regression suite ==\n'
(cd backend && npm test && npm run build)
printf '\n== Frontend regression gates ==\n'
npm run typecheck
npm run build
printf '\n[PASS] Local RC code quality gates finished\n'
