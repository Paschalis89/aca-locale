# Historical v0.9.17 manual Shopify QA checklist

**Status: retained for traceability, not a v1.0 Stable acceptance certificate.**

The original detailed v0.9.17 checklist is available in Git history at `0ada7b1` and earlier. Use the current production acceptance script (`deploy/acceptance/aca-production-acceptance.sh`) for automated readiness, and retain the following explicit manual gates for any future release claim:

- [ ] Use a dedicated, unpublished test product or approved isolated store; record resource identity privately.
- [ ] Verify published target locale and source freshness before translation.
- [ ] Confirm safe automation configuration (`autoPublish=false`, human review required) for the QA scenario.
- [ ] Perform targeted scan, job, review, approval, publish and **Shopify API readback** only on approved test data.
- [ ] Verify repeat publication idempotency and rejection of stale source values.
- [ ] Check no unintended live product content or translation remains after QA.
- [ ] Record real cross-shop isolation, authenticated Shopify session recovery, webhook retries and executed rollback as **NOT VERIFIED** unless actually performed end-to-end.
- [ ] Validate web/frontend and NestJS tests/builds, and save evidence without credentials or OAuth tokens.

Never use production database `UPDATE` statements, fabricated Shopify webhooks, or irreversible rollback operations merely to satisfy a checklist item.
