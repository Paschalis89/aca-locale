import { describe, expect, it } from 'vitest';
import { analyzePricingPreview } from '../src/ai/usage-pricing.service.js';

const ledger = [
  { provider: 'DEEPL', model: null, stage: 'TRANSLATION', usageKnown: true, billedCharacters: 1000, inputTokens: 0, outputTokens: 0 },
  { provider: 'OPENAI', model: 'm1', stage: 'REVIEW', usageKnown: true, billedCharacters: 0, inputTokens: 100, outputTokens: 10 },
  { provider: 'ANTHROPIC', model: 'm2', stage: 'REVIEW', usageKnown: true, billedCharacters: 0, inputTokens: 50, outputTokens: 10 },
  { provider: 'DEEPL', model: null, stage: 'TRANSLATION', usageKnown: false, billedCharacters: 0, inputTokens: 0, outputTokens: 0 },
];

describe('cost intelligence preview', () => {
  it('groups known costs and identifies missing rate keys without treating unknown usage as free', () => {
    const result = analyzePricingPreview(ledger, {
      'DEEPL:*': { charactersPerMillionUsd: 25 },
      'OPENAI:m1': { inputPerMillionUsd: 1, outputPerMillionUsd: 4 },
    }, 4);
    expect(result).toMatchObject({ costedEvents: 2, unpricedEvents: 1, unknownUsageEvents: 1, costCoveragePercent: 50, complete: false, projected30DayUsd: null });
    expect(result.estimatedCostUsd).toBe(0.02514);
    expect(result.missingRateKeys).toEqual(['ANTHROPIC:m2']);
    expect(result.byProviderModel.find((row) => row.provider === 'DEEPL')).toMatchObject({ events: 2, priced: 1, unknownUsage: 1 });
  });
  it('uses 100% coverage on an empty and complete ledger, without inventing a projection', () => {
    const result = analyzePricingPreview([], {}, 0);
    expect(result).toMatchObject({ complete: true, costCoveragePercent: 100, projected30DayUsd: null, estimatedCostUsd: 0 });
  });
  it('does not claim complete coverage when results are truncated', () => {
    const result = analyzePricingPreview(ledger.slice(0,1), { 'DEEPL:*': { charactersPerMillionUsd: 25 } }, 11000);
    expect(result).toMatchObject({ truncated: true, complete: false, projected30DayUsd: null });
  });
});
