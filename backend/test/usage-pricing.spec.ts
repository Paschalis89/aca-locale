import { describe, expect, it } from 'vitest';
import { validateUsagePricingRules } from '../src/ai/usage-pricing.service.js';
import { estimateUsageCost } from '../src/translation-usage/translation-usage-cost.js';

describe('ACA Locale v0.9.4 pricing rules', () => {
  it('accepts explicit per-model and wildcard USD/million rates', () => {
    expect(validateUsagePricingRules({
      'DEEPL:*': { charactersPerMillionUsd: 25 },
      'OPENAI:model-x': { inputPerMillionUsd: 1, outputPerMillionUsd: 4 },
    })).toHaveProperty('OPENAI:model-x');
  });
  it('rejects invalid and negative rates', () => {
    expect(() => validateUsagePricingRules({ 'OPENAI:x': { inputPerMillionUsd: -1 } })).toThrow();
    expect(() => validateUsagePricingRules({ 'OPENAI:x': { inputPerMillionUsd: '1' } })).toThrow();
    expect(() => validateUsagePricingRules({ 'bad-key': { inputPerMillionUsd: 1 } })).toThrow();
  });
  it('does not undercount partial pricing and retains version', () => {
    const pricing = { rules: {
      'OPENAI:model-x': { inputPerMillionUsd: 2 },
    }, version: '7' };
    expect(estimateUsageCost({ provider: 'OPENAI', model: 'model-x', inputTokens: 100, outputTokens: 25 }, pricing))
      .toMatchObject({ estimatedCostMicrousd: null, pricingVersion: '7' });
    expect(estimateUsageCost({ provider: 'OPENAI', model: 'model-x', inputTokens: 100, outputTokens: 0 }, pricing))
      .toMatchObject({ estimatedCostMicrousd: 200, pricingVersion: '7' });
  });
  it('does not fabricate a cost without a matching rule', () => {
    expect(estimateUsageCost({ provider: 'ANTHROPIC', model: 'unknown', inputTokens: 50 }, { rules: {}, version: '1' })
      .estimatedCostMicrousd).toBeNull();
  });
});
