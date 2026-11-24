import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetryProcessingWebhookClaim } from '../../app/lib/webhook-delivery-policy.ts';

test('retries a duplicate delivery while original is PROCESSING', () => {
  assert.equal(shouldRetryProcessingWebhookClaim({process:false,duplicate:true,status:'PROCESSING'}),true);
});
test('does not retry a completed duplicate delivery', () => {
  assert.equal(shouldRetryProcessingWebhookClaim({process:false,duplicate:true,status:'COMPLETED'}),false);
});
test('does not retry a FAILED event which has been reclaimed for processing', () => {
  assert.equal(shouldRetryProcessingWebhookClaim({process:true,retry:true,status:'PROCESSING'}),false);
});
test('does not retry ignored/inactive shop events', () => {
  assert.equal(shouldRetryProcessingWebhookClaim({process:false}),false);
});
test('does not treat unmarked status as an in-progress duplicate', () => {
  assert.equal(shouldRetryProcessingWebhookClaim({process:false,duplicate:true}),false);
});
