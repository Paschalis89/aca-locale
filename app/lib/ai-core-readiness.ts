/** ACA Locale -> ACA AI Core integration contract preview (no network or mutation). */
export type AiCoreProvider = { provider: string; status: string };
export type AiCoreConfig = {
  translationProvider: string; translationModel: string;
  fallbackProvider: string; fallbackModel: string;
  reviewProvider: string; reviewModel: string;
};
export type AiCoreReadinessInput = {
  config: AiCoreConfig;
  providerHealth: AiCoreProvider[] | null;
  budget: { monthlyBudgetUsd: number; incomplete: boolean; unpricedEvents: number; unknownUsageEvents: number } | null;
};
export type AiCoreFinding = { level: 'INFO' | 'WARNING'; code: string; detail: string };

const normalize = (value: string) => value.trim().toUpperCase();
const cleanModel = (value: string) => value.trim();
const supported = new Set(['DEEPL', 'OPENAI', 'ANTHROPIC', 'GOOGLE']);

export function createAiCoreReadiness(input: AiCoreReadinessInput) {
  const { config, providerHealth, budget } = input;
  const findings: AiCoreFinding[] = [];
  const routes = [
    { stage: 'TRANSLATION', role: 'PRIMARY', provider: normalize(config.translationProvider), model: cleanModel(config.translationModel) },
    { stage: 'TRANSLATION', role: 'FALLBACK', provider: normalize(config.fallbackProvider), model: cleanModel(config.fallbackModel) },
    { stage: 'AI_REVIEW', role: 'REVIEW', provider: normalize(config.reviewProvider), model: cleanModel(config.reviewModel) },
  ].filter((route) => route.provider);

  for (const route of routes) {
    if (!supported.has(route.provider)) {
      findings.push({ level: 'WARNING', code: 'UNSUPPORTED_PROVIDER', detail: `${route.role}: unrecognized provider ${route.provider}` });
    }
    if (route.provider !== 'DEEPL' && !route.model) {
      findings.push({ level: 'WARNING', code: 'MISSING_MODEL', detail: `${route.role}: ${route.provider} requires a model ID` });
    }
  }
  if (!config.fallbackProvider.trim()) {
    findings.push({ level: 'INFO', code: 'NO_FALLBACK', detail: 'No translation fallback configured.' });
  } else if (normalize(config.translationProvider) === normalize(config.fallbackProvider) &&
    cleanModel(config.translationModel) === cleanModel(config.fallbackModel)) {
    findings.push({ level: 'WARNING', code: 'DUPLICATE_FALLBACK', detail: 'Fallback is identical to the primary route.' });
  }
  if (!providerHealth) {
    findings.push({ level: 'INFO', code: 'HEALTH_NOT_CHECKED', detail: 'Run Check provider connections in Settings for a fresh credential snapshot.' });
  } else {
    for (const route of routes) {
      const status = providerHealth.find((row) => normalize(row.provider) === route.provider)?.status;
      if (status !== 'OK') findings.push({ level: 'WARNING', code: 'PROVIDER_NOT_VERIFIED', detail: `${route.role}: ${route.provider} health is ${status ?? 'UNKNOWN'}.` });
    }
  }
  if (!budget) {
    findings.push({ level: 'INFO', code: 'BUDGET_NOT_CHECKED', detail: 'Budget summary is not loaded.' });
  } else {
    if (budget.monthlyBudgetUsd <= 0) findings.push({ level: 'INFO', code: 'NO_BUDGET', detail: 'No monthly advisory budget configured.' });
    if (budget.incomplete) findings.push({ level: 'WARNING', code: 'INCOMPLETE_COSTS', detail: `${budget.unpricedEvents} unpriced and ${budget.unknownUsageEvents} unknown-usage events; spending cannot be used for enforcement.` });
  }

  // Only public routing metadata. Intentionally excludes tokens, prompts, shop identity, and provider secrets.
  const contract = {
    schemaVersion: 'aca-ai-core-routing-preview/v1',
    mode: 'LOCAL_ONLY',
    executionEnabled: false,
    automaticFallbackEnabled: false,
    routes: routes.map(({ stage, role, provider, model }) => ({ stage, role, provider, model: model || null })),
    safeguards: { requireExplicitOptIn: true, preserveCurrentProviderAdapters: true, noHistoricalLedgerMutation: true },
  };
  return { status: 'NOT_CONNECTED' as const, routes, findings, contract };
}
