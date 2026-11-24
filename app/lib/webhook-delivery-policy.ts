/**
 * A duplicate webhook delivery is only safe to acknowledge once its original
 * event has finished. A 503 preserves Shopify's delivery retry behavior while
 * the first delivery is still PROCESSING. Do not retry completed/ignored events.
 */
export function shouldRetryProcessingWebhookClaim(claim: {
  process: boolean;
  duplicate?: boolean;
  status?: string;
}): boolean {
  return claim.process === false &&
    claim.duplicate === true &&
    claim.status === 'PROCESSING';
}
