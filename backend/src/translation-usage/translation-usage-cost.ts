type UsagePricingRule = {
  charactersPerMillionUsd?: number;

  inputPerMillionUsd?: number;

  outputPerMillionUsd?: number;
};

type UsageCostInput = {
  provider: string;

  model?: string | null;

  billedCharacters?: number;

  inputTokens?: number;

  outputTokens?: number;
};

export type UsageCostEstimate = {
  estimatedCostMicrousd: number | null;

  pricingKey: string | null;

  pricingVersion: string | null;
};

/**
 * Pricing is intentionally configuration-driven.
 *
 * Vendor prices can change over time and different
 * models from the same provider can have different
 * prices. We therefore never bake vendor prices into
 * the application code.
 *
 * ACA_LOCALE_USAGE_PRICING_JSON example:
 *
 * {
 *   "DEEPL:*": {
 *     "charactersPerMillionUsd": 25
 *   },
 *   "OPENAI:gpt-example": {
 *     "inputPerMillionUsd": 1,
 *     "outputPerMillionUsd": 4
 *   },
 *   "ANTHROPIC:*": {
 *     "inputPerMillionUsd": 3,
 *     "outputPerMillionUsd": 15
 *   }
 * }
 *
 * Exact provider:model wins over provider:*.
 */
export function estimateUsageCost(input: UsageCostInput): UsageCostEstimate {
  const rules = readPricingRules();

  const provider = input.provider.trim().toUpperCase();

  const model = input.model?.trim() || null;

  const exactKey = model ? `${provider}:${model}` : null;

  const wildcardKey = `${provider}:*`;

  const pricingKey =
    exactKey && rules[exactKey]
      ? exactKey
      : rules[wildcardKey]
        ? wildcardKey
        : null;

  if (!pricingKey) {
    return {
      estimatedCostMicrousd: null,

      pricingKey: null,

      pricingVersion: process.env.ACA_LOCALE_USAGE_PRICING_VERSION ?? null,
    };
  }

  const rule = rules[pricingKey];

  let microusd = 0;

  let hasApplicableRate = false;

  const billedCharacters = safeUsageNumber(input.billedCharacters);

  const inputTokens = safeUsageNumber(input.inputTokens);

  const outputTokens = safeUsageNumber(input.outputTokens);

  /*
   * USD / 1,000,000 units converts neatly
   * to micro-USD:
   *
   * units / 1,000,000 * USD-rate * 1,000,000
   * = units * USD-rate.
   */
  if (billedCharacters > 0 && isValidRate(rule.charactersPerMillionUsd)) {
    microusd += billedCharacters * rule.charactersPerMillionUsd!;

    hasApplicableRate = true;
  }

  if (inputTokens > 0 && isValidRate(rule.inputPerMillionUsd)) {
    microusd += inputTokens * rule.inputPerMillionUsd!;

    hasApplicableRate = true;
  }

  if (outputTokens > 0 && isValidRate(rule.outputPerMillionUsd)) {
    microusd += outputTokens * rule.outputPerMillionUsd!;

    hasApplicableRate = true;
  }

  /*
   * A successful request can legitimately
   * report zero usage. If the rule exists,
   * zero is still a known estimated cost.
   */
  if (
    !hasApplicableRate &&
    billedCharacters === 0 &&
    inputTokens === 0 &&
    outputTokens === 0
  ) {
    return {
      estimatedCostMicrousd: 0,

      pricingKey,

      pricingVersion: process.env.ACA_LOCALE_USAGE_PRICING_VERSION ?? null,
    };
  }

  if (!hasApplicableRate) {
    return {
      estimatedCostMicrousd: null,

      pricingKey,

      pricingVersion: process.env.ACA_LOCALE_USAGE_PRICING_VERSION ?? null,
    };
  }

  return {
    estimatedCostMicrousd: Math.max(0, Math.round(microusd)),

    pricingKey,

    pricingVersion: process.env.ACA_LOCALE_USAGE_PRICING_VERSION ?? null,
  };
}

function readPricingRules(): Record<string, UsagePricingRule> {
  const raw = process.env.ACA_LOCALE_USAGE_PRICING_JSON?.trim();

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, UsagePricingRule>;

    const normalized: Record<string, UsagePricingRule> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const separator = key.indexOf(':');

      if (separator <= 0) {
        continue;
      }

      const provider = key.slice(0, separator).trim().toUpperCase();

      const model = key.slice(separator + 1).trim();

      if (!provider || !model) {
        continue;
      }

      normalized[`${provider}:${model}`] = value;
    }

    return normalized;
  } catch (error) {
    console.error('[ACA Locale] Invalid ACA_LOCALE_USAGE_PRICING_JSON:', error);

    return {};
  }
}

function safeUsageNumber(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function isValidRate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
