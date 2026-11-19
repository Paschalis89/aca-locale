/** Pure, UI-independent conversion for the guided pricing editor. */
export type PricingEditorRow = {
  provider: string;
  model: string;
  charactersPerMillionUsd: string;
  inputPerMillionUsd: string;
  outputPerMillionUsd: string;
};

type PricingRateKey = 'charactersPerMillionUsd' | 'inputPerMillionUsd' | 'outputPerMillionUsd';
type PricingRates = Partial<Record<PricingRateKey, number>>;
const rateKeys: PricingRateKey[] = ['charactersPerMillionUsd', 'inputPerMillionUsd', 'outputPerMillionUsd'];

export function pricingRowsFromRules(value: unknown): PricingEditorRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pricing rules must be an object.');
  return Object.entries(value).map(([key, rule]) => {
    const separator = key.indexOf(':');
    if (separator < 0 || !rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`Invalid existing pricing rule: ${key}`);
    const rates = rule as PricingRates;
    return {
      provider: key.slice(0, separator),
      model: key.slice(separator + 1),
      charactersPerMillionUsd: rates.charactersPerMillionUsd === undefined ? '' : String(rates.charactersPerMillionUsd),
      inputPerMillionUsd: rates.inputPerMillionUsd === undefined ? '' : String(rates.inputPerMillionUsd),
      outputPerMillionUsd: rates.outputPerMillionUsd === undefined ? '' : String(rates.outputPerMillionUsd),
    };
  });
}

export function rulesFromPricingRows(rows: PricingEditorRow[]): Record<string, PricingRates> {
  if (rows.length > 50) throw new Error('A maximum of 50 pricing rules is supported.');
  const rules: Record<string, PricingRates> = {};
  for (const [index, row] of rows.entries()) {
    const provider = row.provider.trim().toUpperCase();
    const model = row.model.trim();
    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(provider) || !/^([a-zA-Z0-9_.-]{1,100}|\*)$/.test(model)) {
      throw new Error(`Row ${index + 1}: invalid provider or model identifier.`);
    }
    const key = `${provider}:${model}`;
    if (Object.prototype.hasOwnProperty.call(rules, key)) throw new Error(`Duplicate provider/model: ${key}`);
    const rates: PricingRates = {};
    for (const rateKey of rateKeys) {
      const raw = row[rateKey].trim();
      if (raw === '') continue;
      const rate = Number(raw);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100000) throw new Error(`${key}: ${rateKey} must be between 0 and 100000.`);
      rates[rateKey] = rate;
    }
    if (!Object.keys(rates).length) throw new Error(`${key}: enter at least one rate.`);
    rules[key] = rates;
  }
  return rules;
}
