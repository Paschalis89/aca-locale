# v0.9.17 Manual E2E — Controlled Shopify resource

**Safety gate: NEVER execute on a customer-facing product without explicit sign-off.** Use a dedicated unpublished Shopify test product, or Shopify development store. Do not create live publications automatically. Take a current backup before test; verify rights and keep identifiers/credentials out of logs/screenshots.

## PRE-FLIGHT (record PASS/FAIL / evidence locally)
- [ ] ACA Locale production containers show `healthy` and current commit is known.
- [ ] Shopify test product is **not published to sales channels**. Note its resource GID privately.
- [ ] Select a published Shopify target locale. A locale merely configured but unpublished is not enough for storefront validation.
- [ ] Record original title, source language, source digest and current translation if any. Choose a dedicated test field with no commercial use.
- [ ] Disable automatic publication; confirm from configuration and monitor. Keep human approval mandatory.
- [ ] Review requested provider credentials, budget and current webhook health.
- [ ] Backup complete and rollback of test translation is planned (Shopify itself is source of truth).

## WORKFLOW (manual UI; each stage must be captured)
- [ ] Scan the dedicated Shopify resource; check correct source and target status (`MISSING` or `OUTDATED`).
- [ ] Create a translation job filtered to this test resource if the UI supports such precision. If not, **STOP**: do not create a broad job involving real products.
- [ ] Execute the job; verify translation output, provider, token/character usage, deterministic validation and failure behavior.
- [ ] Trigger AI Review if enabled; verify review output does not automatically approve.
- [ ] Edit and manually approve the test translation; verify audit trail.
- [ ] Publish exactly the approved test item via the explicit manual publish control. Confirm Shopify `translationsRegister` succeeds, no userErrors.
- [ ] Read back translation from Shopify Admin API, not only internal DB. For storefront, test a published test resource in a safe preview context; an unpublished resource may not have a public storefront URL.
- [ ] Publish again: expect idempotent already-published result; no duplicate DB state.

## NEGATIVE / RECOVERY TESTS
- [ ] Modify source on test product *after* approval; publication must fail on freshness check. Restore source for remaining QA.
- [ ] Reject a separate test translation, regenerate; verify no stale translation is published.
- [ ] Simulate an unavailable provider only in an isolated environment; verify graceful failed status and controlled retry.
- [ ] Check that cross-shop authorization cannot access another shop's items (isolated test account/store only).
- [ ] Review webhook delivery, deduplication and Shopify-side update after a source change.
- [ ] Restore test product's original content and translation and confirm no unwanted live localization remains.

## RELEASE GATE
- [ ] Frontend typecheck/build PASS.
- [ ] Backend unit + integration tests PASS.
- [ ] All above manual test steps PASS with evidence.
- [ ] No customer-facing product changed and no unintended automation invoked.
- [ ] Security: API token not logged; no Shopify Admin credentials copied into evidence.
- [ ] Any failed or blocked test recorded as NOT VERIFIED, never as PASS.

If a setup prerequisite or safe product-level filter is unavailable, do not try a live E2E in production. Carry that requirement into v0.9.18.
