# ACA Locale — Project Changelog

This file tracks **ACA Locale project** milestones, not upstream Shopify/NestJS template release notes. For exact source changes and dates use `git log --oneline --decorate`.

## Unreleased — documentation and repository maintenance

- Remove generated TypeScript build cache from Git tracking (`0ada7b1`).
- Consolidate obsolete 10G patch instructions into maintained project documentation.
- Replace generic framework-template README files with ACA-specific guidance.
- Preserve all database migrations, live deploy/recovery scripts and security regression tests.

## 2026-11-24 — UI polish and interface localization

- Jobs and International SEO button/table improvements.
- Markets & Localization and Operations dashboard presentation improvements.
- Italian/English interface switch, UI dictionary and corresponding frontend contract tests (`b2986bc`).

## 2026-11 — Release candidate and operational readiness

- RC security/resilience unit coverage for tenant isolation and webhook retry scenarios (`07da390`).
- Isolated PostgreSQL restore drill, Shopify session backup integrity checks and rollback image preflight.
- Production acceptance, read-only operational snapshot and authenticated Operations dashboard.
- **Release status:** these tests do not by themselves certify a complete real cross-shop, Shopify-session-restoration or executed rollback E2E scenario. Mark unverified gates explicitly.

## 2026-11 — Translation automation reliability (10G)

- Bounded translation/review/publication retry stages, recovery behavior, throttling and queue resilience tests.
- Schema/migration: `backend/prisma/migrations/20261113222623_add_translation_automation_recovery/`.
- Historical apply guides (`APPLY-10G.md`, `README-10G.md`, `README-10G-FIX.md`) are retired. Their full contents remain in prior Git commits. Do **not** re-run their migration instructions against production.

## Upstream template history

The previous `CHANGELOG.md` recorded Shopify React Router / Remix template changes rather than ACA Locale releases. The original file remains retrievable from Git history at revision `0ada7b1` and earlier. Review upstream dependency release notes separately when upgrading dependencies.
