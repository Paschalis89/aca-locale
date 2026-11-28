import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { formatUsageUsd, usageHasUnpricedCosts } from "../lib/usage-analytics";
import { pricingRowsFromRules, rulesFromPricingRows, type PricingEditorRow } from "../lib/usage-pricing-editor";
import { qualitySnapshot } from "../lib/translation-quality";
import { auditSeoField, summarizeSeoAudit } from "../lib/international-seo";
import { summarizeLocalization, type ShopifyMarketSnapshot, type ShopifyLocaleSnapshot } from "../lib/market-localization";
import { normalizeProductId } from "../lib/product-scan-scope";
import { createAiCoreReadiness } from "../lib/ai-core-readiness";
import { uiTranslate, type UiLanguage } from "../lib/ui-language";

const UiLanguageContext = createContext<UiLanguage>("it");
function UiText({ value }: { value: string }) {
  const language = useContext(UiLanguageContext);
  return <>{uiTranslate(value, language)}</>;
}


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type AppTab =
  | "overview"
  | "scanner"
  | "jobs"
  | "review"
  | "seo"
  | "markets"
  | "ai-core"
  | "glossary"
  | "usage"
  | "settings"
  | "operations";

type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

type ItemStatus =
  | "PENDING"
  | "GENERATING"
  | "GENERATED"
  | "VALIDATED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "FAILED";

type JobItem = {
  id: string;
  jobId: string;
  fieldId?: string;
  status: ItemStatus;
  sourceValue: string;
  translatedValue?: string | null;
  approvedValue?: string | null;
  provider?: string | null;
  model?: string | null;
  generatedAt?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  aiReviewedAt?: string | null;
  aiReviewScore?: number | null;
  aiReviewPassed?: boolean | null;
  aiReviewIssues?: unknown;
  aiReviewSuggestedTranslation?: string | null;
  humanReviewNote?: string | null;
  validationWarnings?: number;
  validationErrors?: number;
  validationPassed?: boolean | null;
  validationVersion?: string | null;
  validationIssues?: unknown;
  errorMessage?: string | null;
  regeneratedFromItemId?: string | null;
  field?: {
    key?: string;
    type?: string;
    sourceLocale?: string;
    resource?: {
      resourceType?: string;
      shopifyResourceId?: string;
    };
  };
};

type TranslationJob = {
  id: string;
  sourceLocale: string;
  targetLocale: string;
  status: JobStatus;
  origin?: "MANUAL" | "SHOPIFY_CHANGE";
  changeEventId?: string | null;
  provider?: string | null;
  model?: string | null;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  reviewProvider?: string | null;
  reviewModel?: string | null;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  items?: JobItem[];
  execution?: Record<string, unknown>;
  reviewExecution?: Record<string, unknown>;
};

type AiBudgetSummary = {
  month: string;
  version: number;
  monthlyBudgetUsd: number;
  estimatedCostUsd: number;
  percentOfBudget: number | null;
  threshold: "NOT_CONFIGURED" | "OVER_100" | "OVER_80" | "OVER_50" | "BELOW_50";
  incomplete: boolean;
  advisoryOnly: boolean;
  enforcementEnabled: boolean;
  totalEvents: number;
  sampledEvents: number;
  truncated: boolean;
  unpricedEvents: number;
  unknownUsageEvents: number;
  failedEvents: number;
  fallbackEvents?: number;
  alertDelivery?: "IN_APP_ONLY";
  fallbackPolicy?: "UNCHANGED";
  alerts?: Array<{ code: string; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; detail: string }>;
  recentFailures?: Array<{ id: string; createdAt: string; provider: string; model: string | null; stage: string; fallback: boolean; category: string }>;
  failureHistoryTruncated?: boolean;
  byProvider: Array<{ provider: string; events: number; failed: number; unpriced: number; estimatedCostUsd: number }>;
  byModel: Array<{ provider: string; model: string; events: number; failed: number; estimatedCostUsd: number }>;
};

type OperationsSnapshot = {
  snapshotAt: string;
  periodHours: number;
  staleThresholdMinutes: number;
  state: "HEALTHY" | "RECOVERED" | "DEGRADED" | "UNKNOWN";
  errors24h: number;
  shop: { jobsFailed: number; jobsStaleRunning: number; jobsDueRetry: number; itemsFailed: number; webhooksFailed: number; webhooksStaleProcessing: number };
  providers: Array<{ provider: string; successes24h: number; errors24h: number; lastSuccessAt: string | null; lastErrorAt: string | null; state: "HEALTHY" | "RECOVERED" | "DEGRADED" }>;
  advisoryOnly: boolean;
  note: string;
};

type AutomationMonitor = {
  periodDays: number;
  snapshotAt: string;
  events: { total: number; PROCESSING: number; COMPLETED: number; FAILED: number };
  automaticJobs: { total: number; stages: Record<string, number>; statuses: Record<string, number> };
  pendingRetries: number;
  recentFailures: Array<{ id: string; topic: string; resourceType: string; attempts: number; createdAt: string }>;
  note: string;
};

type UsageTotals = {
  estimatedCostMicrousd: number;
  billedCharacters: number;
  inputTokens: number;
  outputTokens: number;
  events: number;
  successfulEvents: number;
  failedEvents: number;
  usageUnknownEvents: number;
  costedEvents: number;
  unpricedEvents: number;
};

type UsageProviderRow = UsageTotals & {
  stage?: string;
  provider: string;
  model?: string | null;
};

type UsageSummary = {
  period?: { days: number; from: string; to: string };
  totals: UsageTotals;
  byStage?: Array<UsageTotals & { stage: string }>;
  byProvider?: UsageProviderRow[];
  byProviderStage?: UsageProviderRow[];
  daily?: Array<UsageTotals & { date: string }>;
  monthly?: Array<UsageTotals & { month: string }>;
};

type ScannerResult = {
  shop?: string;
  resourceType?: string;
  targetLocale?: string;
  summary?: {
    resources?: number;
    fields?: number;
    actionableFields?: number;
    emptySource?: number;
    missing?: number;
    translated?: number;
    outdated?: number;
    coverage?: number;
  };
  resources?: unknown[];
  [key: string]: unknown;
};

type AiProviderHealthRow = {
  provider: string;
  status: "OK" | "ERROR" | "NOT_CONFIGURED";
  latencyMs: number | null;
  message: string;
  availableModels?: number;
  usage?: { characterCount: number; characterLimit: number };
};

type AiModelCatalogRow = {
  provider: string;
  status: "OK" | "ERROR" | "NOT_CONFIGURED";
  configured: boolean;
  requiresModel: boolean;
  message: string;
  modelCount: number;
  models: Array<{ id: string; name: string; selectable: boolean; createdAt?: string | null }>;
};

type AiModelCatalog = {
  generatedAt: string;
  providers: AiModelCatalogRow[];
};

type AiConfigurationForm = {
  translationProvider: string;
  translationModel: string;
  reviewProvider: string;
  reviewModel: string;
  fallbackProvider: string;
  fallbackModel: string;
};

type GlossaryRuleType =
  | "DO_NOT_TRANSLATE"
  | "PREFERRED_TRANSLATION"
  | "FORBIDDEN_TRANSLATION";

type GlossaryEntry = {
  id: string;
  glossaryId: string;
  sourceTerm: string;
  targetLocale: string;
  targetTerm?: string | null;
  ruleType: GlossaryRuleType;
  caseSensitive: boolean;
  notes?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type GlossaryData = {
  id: string;
  name: string;
  description?: string | null;
  sourceLocale: string;
  enabled: boolean;
  isDefault: boolean;
  entries: GlossaryEntry[];
};

type GlossaryDraft = {
  sourceTerm: string;
  targetLocale: string;
  targetTerm: string;
  ruleType: GlossaryRuleType;
  caseSensitive: boolean;
  notes: string;
  enabled: boolean;
};

const emptyGlossaryDraft = (): GlossaryDraft => ({
  sourceTerm: "",
  targetLocale: "*",
  targetTerm: "",
  ruleType: "DO_NOT_TRANSLATE",
  caseSensitive: true,
  notes: "",
  enabled: true,
});

const ACA = {
  blue: "#133C99",
  green: "#28B58D",
  orange: "#F99F46",
  cream: "#F5F3E9",
  white: "#FFFFFF",
  ink: "#20324A",
  textSoft: "#667085",
  line: "#DDD8CC",
  success: "#18845F",
  warning: "#B96A12",
  danger: "#B44242",
  blueSoft: "#EEF3FF",
  greenSoft: "#EAF8F3",
  orangeSoft: "#FFF1E3",
  shadow: "0 10px 28px rgba(19,60,153,0.07)",
};

const tabs: Array<{ id: AppTab; label: string; short: string }> = [
  { id: "overview", label: "Overview", short: "Overview" },
  { id: "scanner", label: "Store Scan", short: "Scan" },
  { id: "jobs", label: "Jobs", short: "Jobs" },
  { id: "review", label: "Review", short: "Review" },
  { id: "seo", label: "International SEO", short: "SEO" },
  { id: "markets", label: "Markets & Localization", short: "Markets" },
  { id: "ai-core", label: "ACA AI Core", short: "AI Core" },
  { id: "glossary", label: "Glossary", short: "Terms" },
  { id: "usage", label: "Usage", short: "Usage" },
  { id: "operations", label: "Operations", short: "Ops" },
  { id: "settings", label: "Settings", short: "Settings" },
];

const resourceTypes = [
  "PRODUCT",
  "COLLECTION",
  "PAGE",
  "ARTICLE",
  "BLOG",
  "METAOBJECT",
];

export default function Index() {
  const shopify = useAppBridge();
  const [language, setLanguage] = useState<UiLanguage>("it");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("aca-locale-ui-language");
      if (stored === "it" || stored === "en") setLanguage(stored);
    } catch { /* Storage may be unavailable in some embedded contexts. */ }
  }, []);
  const changeUiLanguage = (next: UiLanguage) => {
    setLanguage(next);
    try { window.localStorage.setItem("aca-locale-ui-language", next); } catch { /* No persistent storage. */ }
  };

  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [operations, setOperations] = useState<OperationsSnapshot | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [automationMonitor, setAutomationMonitor] = useState<AutomationMonitor | null>(null);
  const [automationMonitorError, setAutomationMonitorError] = useState<string | null>(null);
  const [automationMonitorLoading, setAutomationMonitorLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [aiBudget, setAiBudget] = useState<AiBudgetSummary | null>(null);
  const [aiBudgetInput, setAiBudgetInput] = useState("0");
  const [aiBudgetError, setAiBudgetError] = useState<string | null>(null);

  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [publicationVerification, setPublicationVerification] = useState<{ status: string; reason?: string; verifiedAt?: string; actualValue?: string | null; expectedValue?: string } | null>(null);
  const [publicationVerificationItemId, setPublicationVerificationItemId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [targetLocale, setTargetLocale] = useState("it");
  const [resourceType, setResourceType] = useState("PRODUCT");
  const [maxItems, setMaxItems] = useState(10);
  const [approvedValue, setApprovedValue] = useState("");
  const [approveNote, setApproveNote] = useState(
    "Approved in ACA Locale dashboard.",
  );
  const [rejectNote, setRejectNote] = useState(
    "Translation requires regeneration.",
  );

  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("ALL");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewLocale, setReviewLocale] = useState("ALL");
  const [reviewType, setReviewType] = useState("ALL");
  const [reviewStatus, setReviewStatus] = useState("ALL");
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
  const [reviewPageNumber, setReviewPageNumber] = useState(1);
  const [reviewPageData, setReviewPageData] = useState<{ items: Array<JobItem & { job: TranslationJob }>; total: number; pages: number; page: number } | null>(null);
  const [reviewPageLoading, setReviewPageLoading] = useState(false);
  const [reviewPageError, setReviewPageError] = useState<string | null>(null);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);


  const [scannerLocale, setScannerLocale] = useState("en");
  const [targetedProductScan, setTargetedProductScan] = useState(true);
  const [scannerProductId, setScannerProductId] = useState("");
  const [scannerResourceType, setScannerResourceType] = useState("PRODUCT");
  const [scannerResult, setScannerResult] = useState<ScannerResult | null>(null);
  const [seoLocale, setSeoLocale] = useState("en");
  const [seoField, setSeoField] = useState("meta_title");
  const [seoValue, setSeoValue] = useState("");
  const [seoFilter, setSeoFilter] = useState("ALL");

  const [syncResult, setSyncResult] = useState<any>(null);
  const [shopifySyncAt, setShopifySyncAt] = useState<string | null>(null);
  const [liveMarkets, setLiveMarkets] = useState<ShopifyMarketSnapshot[] | null>(null);
  const [liveLocales, setLiveLocales] = useState<ShopifyLocaleSnapshot[] | null>(null);
  const [marketSnapshotAt, setMarketSnapshotAt] = useState<string | null>(null);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);

  const [glossary, setGlossary] = useState<GlossaryData | null>(null);
  const [loadingGlossary, setLoadingGlossary] = useState(false);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);
  const [glossarySearch, setGlossarySearch] = useState("");
  const [glossaryLocaleFilter, setGlossaryLocaleFilter] = useState("ALL");
  const [editingGlossaryEntryId, setEditingGlossaryEntryId] = useState<string | null>(null);
  const [glossaryDraft, setGlossaryDraft] = useState<GlossaryDraft>(emptyGlossaryDraft);

  const [aiConfiguration, setAiConfiguration] = useState<AiConfigurationForm>({
    translationProvider: "DEEPL",
    translationModel: "",
    reviewProvider: "ANTHROPIC",
    reviewModel: "claude-sonnet-5-5",
    fallbackProvider: "OPENAI",
    fallbackModel: "gpt-6-luna",
  });

  const [aiProviderHealth, setAiProviderHealth] = useState<AiProviderHealthRow[] | null>(null);
  const [aiProviderHealthError, setAiProviderHealthError] = useState<string | null>(null);
  const [aiProviderHealthCheckedAt, setAiProviderHealthCheckedAt] = useState<string | null>(null);
  const [aiModelCatalog, setAiModelCatalog] = useState<AiModelCatalog | null>(null);
  const [aiModelCatalogError, setAiModelCatalogError] = useState<string | null>(null);
  const [aiCatalogProviderFilter, setAiCatalogProviderFilter] = useState("ALL");
  const [aiCatalogSearch, setAiCatalogSearch] = useState("");

  const [pricingVersion, setPricingVersion] = useState(0);
  const [pricingSource, setPricingSource] = useState("ENVIRONMENT");
  const [pricingRulesText, setPricingRulesText] = useState("{}");
  const [pricingRows, setPricingRows] = useState<PricingEditorRow[]>([]);
  const [pricingAdvanced, setPricingAdvanced] = useState(false);
  const [pricingDirty, setPricingDirty] = useState(false);
  const [pricingHistory, setPricingHistory] = useState<Array<{version: number; createdAt: string}>>([]);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingPreview, setPricingPreview] = useState<null | {
    dryRun: boolean; totalEvents: number; sampledEvents: number; truncated: boolean; costedEvents: number;
    unpricedEvents: number; unknownUsageEvents: number; estimatedCostUsd: number; complete: boolean;
    costCoveragePercent?: number; projected30DayUsd?: number | null; projectedMonthUsd?: number | null; lowerBound30DayUsd?: number;
    missingRateKeys?: string[]; missingRateKeysTruncated?: boolean;
    byProviderModel?: Array<{ provider: string; model: string | null; stage: string; events: number; priced: number; unpriced: number; unknownUsage: number; estimatedCostUsd: number }>;
    groupsTruncated?: boolean;
  }>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const apiCall = async (
    url: string,
    options: RequestInit = {},
    updateDebug = true,
  ) => {
    const token = await shopify.idToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const responseText = await response.text();
    let data: any = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { result: responseText };
    }

    if (updateDebug) {
      setLastResult(data);
    }

    if (!response.ok) {
      throw new Error(data?.message ?? `HTTP ${response.status}`);
    }

    return data;
  };

  const runAction = async (
    actionKey: string,
    handler: () => Promise<void>,
    successMessage?: string,
  ) => {
    try {
      setBusyAction(actionKey);
      await handler();
      if (successMessage) {
        shopify.toast.show(successMessage);
      }
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Operation failed";
      shopify.toast.show(message, { isError: true });
    } finally {
      setBusyAction(null);
    }
  };

  const loadMarketSnapshot = async () => {
    setMarketsLoading(true);
    setMarketsError(null);
    try {
      // GET-only Shopify Admin queries. No backend sync, writes, or translation jobs.
      const [marketData, localeData] = await Promise.all([
        apiCall("/api/shopify/markets", {}, false),
        apiCall("/api/shopify/locales", {}, false),
      ]);
      if (!Array.isArray(marketData?.markets) || !Array.isArray(localeData?.locales)) {
        throw new Error("Unexpected Shopify Markets/Locales API response.");
      }
      setLiveMarkets(marketData.markets);
      setLiveLocales(localeData.locales);
      setMarketSnapshotAt(new Date().toISOString());
    } catch (error) {
      setMarketsError(error instanceof Error ? error.message : "Unable to load Shopify market snapshot.");
      // Never keep presenting stale market data as a successful fresh snapshot.
      setLiveMarkets(null);
      setLiveLocales(null);
      setMarketSnapshotAt(null);
    } finally {
      setMarketsLoading(false);
    }
  };

  const loadOperations = async () => {
    setOperationsLoading(true);
    setOperationsError(null);
    try {
      const result = await apiCall('/api/backend/operations', {}, false);
      setOperations(result as OperationsSnapshot);
    } catch (error) {
      setOperations(null);
      setOperationsError(error instanceof Error ? error.message : 'Operations unavailable.');
    } finally {
      setOperationsLoading(false);
    }
  };

  const loadAutomationMonitor = async () => {
    setAutomationMonitorLoading(true);
    setAutomationMonitorError(null);
    try {
      const result = await apiCall('/api/backend/translation-automation-monitor', {}, false);
      setAutomationMonitor(result as AutomationMonitor);
    } catch (error) {
      setAutomationMonitorError(error instanceof Error ? error.message : 'Unable to load automation monitor.');
    } finally {
      setAutomationMonitorLoading(false);
    }
  };

  const loadJobs = async (preserveSelection = true) => {
    setLoadingJobs(true);
    setJobsError(null);

    try {
      const data = await apiCall("/api/backend/translation-jobs", {}, false);
      const summaries: TranslationJob[] = Array.isArray(data) ? data : [];

      const detailed = await Promise.all(
        summaries.slice(0, 15).map(async (job) => {
          try {
            return (await apiCall(
              `/api/backend/translation-jobs/${job.id}`,
              {},
              false,
            )) as TranslationJob;
          } catch {
            return job;
          }
        }),
      );

      const nextJobs = [...detailed, ...summaries.slice(15)];
      setJobs(nextJobs);

      const nextSelectedJobId =
        preserveSelection &&
        selectedJobId &&
        nextJobs.some((job) => job.id === selectedJobId)
          ? selectedJobId
          : nextJobs[0]?.id ?? "";

      setSelectedJobId(nextSelectedJobId);
    } catch (error) {
      console.error(error);
      setJobsError(
        error instanceof Error ? error.message : "Unable to load jobs.",
      );
    } finally {
      setLoadingJobs(false);
    }
  };

  const loadJobDetail = async (jobId: string) => {
    const data = (await apiCall(
      `/api/backend/translation-jobs/${jobId}`,
      {},
      false,
    )) as TranslationJob;

    setJobs((current) => {
      const exists = current.some((job) => job.id === jobId);
      if (!exists) {
        return [data, ...current];
      }

      return current.map((job) => (job.id === jobId ? data : job));
    });

    setSelectedJobId(data.id);
    const nextItemId = data.items?.[0]?.id ?? "";
    setSelectedItemId((current) =>
      current && data.items?.some((item) => item.id === current)
        ? current
        : nextItemId,
    );

    return data;
  };

  const loadGlossary = async () => {
    setLoadingGlossary(true);
    setGlossaryError(null);

    try {
      const data = (await apiCall(
        "/api/backend/glossary",
        {},
        false,
      )) as GlossaryData;
      setGlossary(data);
    } catch (error) {
      console.error(error);
      setGlossaryError(
        error instanceof Error ? error.message : "Unable to load glossary.",
      );
    } finally {
      setLoadingGlossary(false);
    }
  };

  // Both lookups require a deliberate operator click. Neither creates an AI inference,
  // modifies credentials, runs translations, or changes the saved shop configuration.
  const checkAiProviderConnections = async () => {
    setAiProviderHealthError(null);
    await runAction("ai-provider-health", async () => {
      try {
        const data = await apiCall("/api/backend/ai-providers-health", {}, false);
        if (!Array.isArray(data?.providers)) throw new Error("Invalid provider status response.");
        setAiProviderHealth(data.providers as AiProviderHealthRow[]);
        setAiProviderHealthCheckedAt(new Date().toISOString());
      } catch (error) {
        setAiProviderHealthError(error instanceof Error ? error.message : "Unable to check provider connections.");
        throw error;
      }
    });
  };

  const browseAiModels = async () => {
    setAiModelCatalogError(null);
    await runAction("ai-model-catalog", async () => {
      try {
        const data = await apiCall("/api/backend/ai-models", {}, false);
        if (!Array.isArray(data?.providers)) throw new Error("Invalid model catalog response.");
        setAiModelCatalog(data as AiModelCatalog);
      } catch (error) {
        setAiModelCatalogError(error instanceof Error ? error.message : "Unable to load models.");
        throw error;
      }
    });
  };

  const chooseAiCatalogModel = (provider: string, modelId: string, target: "translation" | "fallback" | "review") => {
    const upper = provider.toUpperCase();
    setAiConfiguration((current) => target === "translation"
      ? { ...current, translationProvider: upper, translationModel: modelId }
      : target === "fallback"
        ? { ...current, fallbackProvider: upper, fallbackModel: modelId }
        : { ...current, reviewProvider: upper, reviewModel: modelId });
    shopify.toast.show(`Selected ${modelId} for ${target}. Save Configuration to apply to future jobs.`);
  };

  const loadPricing = async () => {
    try {
      const data = await apiCall("/api/backend/usage-pricing", {}, false);
      setPricingVersion(data.version ?? 0);
      setPricingSource(data.source ?? "ENVIRONMENT");
      setPricingRulesText(JSON.stringify(data.rules ?? {}, null, 2));
      setPricingRows(pricingRowsFromRules(data.rules ?? {}));
      setPricingDirty(false);
      setPricingHistory(data.history ?? []);
      setPricingError(null);
      setPricingPreview(null);
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Unable to load pricing.");
    }
  };

  const previewPricing = async () => {
    let rules: unknown;
    try {
      rules = pricingAdvanced ? JSON.parse(pricingRulesText) : rulesFromPricingRows(pricingRows);
      if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("Invalid rules object.");
      setPricingError(null);
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Invalid rules.");
      return;
    }
    await runAction("preview-usage-pricing", async () => {
      const data = await apiCall("/api/backend/usage-pricing-preview", {
        method: "POST", body: JSON.stringify({ rules }),
      });
      setPricingPreview(data);
    }, "Pricing simulation finished. No rates saved.");
  };

  const savePricing = async () => {
    let rules: unknown;
    try {
      rules = pricingAdvanced ? JSON.parse(pricingRulesText) : rulesFromPricingRows(pricingRows);
      if (typeof rules !== "object" || rules === null || Array.isArray(rules)) throw new Error("Pricing rules must be an object.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid pricing rules.";
      setPricingError(message);
      shopify.toast.show(message, { isError: true });
      return;
    }
    if (!window.confirm("Save new version of estimated USD-per-million rates for FUTURE events only? Historical costs stay unchanged.")) return;
    await runAction("save-usage-pricing", async () => {
      await apiCall("/api/backend/usage-pricing", {
        method: "PATCH", body: JSON.stringify({ rules, expectedVersion: pricingVersion }),
      });
      await loadPricing();
    }, "Usage pricing updated for future events.");
  };

  const editPricingRow = (index: number, patch: Partial<PricingEditorRow>) => {
    setPricingRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
    setPricingDirty(true);
    setPricingError(null);
    setPricingPreview(null);
  };

  const switchPricingEditor = () => {
    setPricingPreview(null);
    try {
      if (pricingAdvanced) {
        setPricingRows(pricingRowsFromRules(JSON.parse(pricingRulesText)));
      } else {
        setPricingRulesText(JSON.stringify(rulesFromPricingRows(pricingRows), null, 2));
      }
      setPricingAdvanced((current) => !current);
      setPricingError(null);
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Invalid pricing configuration.");
    }
  };

  const loadAiBudget = async () => {
    try {
      const data = await apiCall("/api/backend/ai-budget", {}, false) as AiBudgetSummary;
      setAiBudget(data);
      setAiBudgetInput(data.monthlyBudgetUsd.toFixed(2));
      setAiBudgetError(null);
    } catch (error) {
      setAiBudgetError(error instanceof Error ? error.message : "Unable to load AI budget.");
    }
  };

  const saveAiBudget = async () => {
    const value = Number(aiBudgetInput);
    if (!aiBudgetInput.trim() || !/^\d+(?:\.\d{1,2})?$/.test(aiBudgetInput.trim()) || !Number.isFinite(value) || value > 1000000) {
      setAiBudgetError("Enter a valid monthly USD budget with up to two decimals. Use 0 to disable alerts.");
      return;
    }
    if (!window.confirm("Save a monthly ADVISORY budget? This will NOT stop translations or AI calls.")) return;
    await runAction("save-ai-budget", async () => {
      await apiCall("/api/backend/ai-budget", { method: "PATCH", body: JSON.stringify({ monthlyBudgetUsd: value, expectedVersion: aiBudget?.version ?? 0 }) });
      await loadAiBudget();
    }, "Advisory AI budget saved.");
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    setUsageError(null);

    try {
      const data = await apiCall(
        "/api/backend/translation-jobs/usage/summary?days=30",
        {},
        false,
      );
      setUsageSummary(data);
    } catch (error) {
      console.error(error);
      setUsageError(
        error instanceof Error
          ? error.message
          : "Unable to load usage summary.",
      );
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    void loadJobs(false);
    void loadUsage();
    void loadAiBudget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "jobs") void loadAutomationMonitor();
    if (activeTab === "operations") void loadOperations();
    if (activeTab === "markets") void loadMarketSnapshot();
    if (activeTab === "settings") { void loadPricing(); void loadAiBudget(); }
    if (activeTab === "usage") void loadAiBudget();
    if (activeTab === "glossary" && !glossary && !loadingGlossary) {
      void loadGlossary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // The dedicated review API searches every job, not just the 15 details
  // initially loaded for the Jobs screen. Each response is tenant-scoped.
  useEffect(() => {
    if (activeTab !== "review") return;
    let cancelled = false;
    setReviewPageLoading(true);
    setReviewPageError(null);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(reviewPageNumber), limit: "30" });
        if (reviewSearch.trim()) params.set("search", reviewSearch.trim());
        if (reviewLocale !== "ALL") params.set("locale", reviewLocale);
        if (reviewType !== "ALL") params.set("resourceType", reviewType);
        if (reviewStatus !== "ALL") params.set("status", reviewStatus);
        const data = await apiCall(`/api/backend/translation-review-queue?${params.toString()}`, {}, false);
        if (!cancelled) setReviewPageData(data);
      } catch (error) {
        if (!cancelled) setReviewPageError(error instanceof Error ? error.message : "Unable to load review queue.");
      } finally {
        if (!cancelled) setReviewPageLoading(false);
      }
    }, reviewSearch ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reviewPageNumber, reviewSearch, reviewLocale, reviewType, reviewStatus, reviewRefreshKey]);

  const activeJobKey = jobs
    .filter((job) => job.status === "QUEUED" || job.status === "RUNNING")
    .map((job) => `${job.id}:${job.status}`)
    .join("|");

  useEffect(() => {
    if (!activeJobKey) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadJobs(true);
    }, 5000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobKey]);

  useEffect(() => {
    const job = jobs.find((entry) => entry.id === selectedJobId);
    const firstItemId = job?.items?.[0]?.id ?? "";

    setSelectedItemId((current) => {
      if (!job) return "";
      if (current && job.items?.some((item) => item.id === current)) {
        return current;
      }
      return firstItemId;
    });
  }, [jobs, selectedJobId]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const selectedItem = useMemo(
    () =>
      selectedJob?.items?.find((item) => item.id === selectedItemId) ??
      selectedJob?.items?.[0] ??
      null,
    [selectedJob, selectedItemId],
  );

  useEffect(() => {
    setApprovedValue(
      selectedItem?.approvedValue ?? selectedItem?.translatedValue ?? "",
    );
    setSelectedItemId(selectedItem?.id ?? "");
  }, [selectedItem]);

  useEffect(() => {
    const latest = jobs[0];
    if (!latest) return;

    setAiConfiguration((current) => ({
      translationProvider: latest.provider ?? current.translationProvider,
      translationModel: latest.model ?? "",
      reviewProvider: latest.reviewProvider ?? current.reviewProvider,
      reviewModel: latest.reviewModel ?? current.reviewModel,
      fallbackProvider: latest.fallbackProvider ?? current.fallbackProvider,
      fallbackModel: latest.fallbackModel ?? "",
    }));
  }, [jobs]);

  const dashboardStats = useMemo(() => {
    const totalJobs = jobs.length;
    const activeJobs = jobs.filter(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    ).length;
    const reviewItems = jobs
      .flatMap((job) => job.items ?? [])
      .filter(
        (item) =>
          item.status === "VALIDATED" || item.status === "NEEDS_REVIEW",
      ).length;
    const publishedItems = jobs
      .flatMap((job) => job.items ?? [])
      .filter((item) => item.status === "PUBLISHED").length;

    return { totalJobs, activeJobs, reviewItems, publishedItems };
  }, [jobs]);

  // Only the first 15 jobs are loaded with item details by the current Jobs API.
  // This local SEO audit must never be presented as a complete Shopify store crawl.
  const seoLoadedRows = useMemo(() => jobs.flatMap(job => (job.items ?? []).map(item => ({
    jobId: job.id,
    itemId: item.id,
    key: item.field?.key ?? "",
    locale: job.targetLocale,
    resourceType: item.field?.resource?.resourceType ?? "UNKNOWN",
    value: item.approvedValue ?? item.translatedValue ?? "",
    status: item.status,
  }))), [jobs]);
  const seoAudit = useMemo(() => summarizeSeoAudit(seoLoadedRows.filter(row => seoLocale === "ALL" || row.locale === seoLocale)), [seoLoadedRows, seoLocale]);
  const seoDraft = useMemo(() => auditSeoField({ key: seoField, locale: seoLocale, value: seoValue }), [seoField, seoLocale, seoValue]);
  const seoVisibleRows = seoAudit.rows.filter(row => seoFilter === "ALL" || row.audit.status === seoFilter).slice(0, 50);

  const reviewQueue = useMemo(
    () =>
      jobs.flatMap((job) =>
        (job.items ?? [])
          .filter(
            (item) =>
              item.status === "VALIDATED" || item.status === "NEEDS_REVIEW",
          )
          .map((item) => ({ job, item })),
      ),
    [jobs],
  );

  const reviewLocales = useMemo(
    () => Array.from(new Set(reviewQueue.map(({ job }) => job.targetLocale))).sort(),
    [reviewQueue],
  );
  const reviewTypes = useMemo(
    () => Array.from(new Set(reviewQueue.map(({ item }) => item.field?.resource?.resourceType ?? "UNKNOWN"))).sort(),
    [reviewQueue],
  );
  const filteredReviewQueue = useMemo(() =>
    (reviewPageData?.items ?? []).map((item) => ({ job: item.job, item })),
    [reviewPageData],
  );

  const bulkApproveSelected = async () => {
    const targets = filteredReviewQueue.filter(({ item }) =>
      selectedReviewIds.includes(item.id) &&
      (item.status === "VALIDATED" || item.status === "NEEDS_REVIEW") &&
      Boolean(item.translatedValue?.trim()) && qualitySnapshot(item).state !== "BLOCKED",
    );
    if (targets.length === 0) {
      shopify.toast.show("Select reviewable items with generated translations.", { isError: true });
      return;
    }
    if (!window.confirm(`Approve ${targets.length} generated translations? This will NOT publish them to Shopify. Review each item before proceeding.`)) return;
    setBusyAction("bulk-approve");
    let success = 0;
    let failures = 0;
    try {
      for (const { job, item } of targets) {
        try {
          await apiCall(`/api/backend/translation-jobs/${job.id}/items/${item.id}/approve`, {
            method: "POST",
            body: JSON.stringify({ note: "Batch approval from ACA Locale review queue." }),
          }, false);
          success += 1;
        } catch (error) {
          failures += 1;
          console.error("Batch approval failed for item", item.id, error);
        }
      }
      setSelectedReviewIds([]);
      await loadJobs();
      setReviewRefreshKey((current) => current + 1);
      if (selectedJobId) await loadJobDetail(selectedJobId);
      shopify.toast.show(`Approved ${success} items; ${failures} failed.${failures ? " Check the review queue." : ""}`, { isError: failures > 0 });
    } finally {
      setBusyAction(null);
    }
  };

  const filteredJobs = useMemo(() => {
    const search = jobSearch.trim().toLowerCase();

    return jobs.filter((job) => {
      if (jobStatusFilter !== "ALL" && job.status !== jobStatusFilter) {
        return false;
      }

      if (!search) return true;

      return [
        job.id,
        job.sourceLocale,
        job.targetLocale,
        job.provider ?? "",
        job.model ?? "",
        job.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [jobs, jobSearch, jobStatusFilter]);

  const glossaryLocales = useMemo(() => {
    const values = new Set<string>();
    for (const entry of glossary?.entries ?? []) {
      values.add(entry.targetLocale);
    }
    return Array.from(values).sort();
  }, [glossary]);

  const filteredGlossaryEntries = useMemo(() => {
    const search = glossarySearch.trim().toLowerCase();

    return (glossary?.entries ?? []).filter((entry) => {
      if (
        glossaryLocaleFilter !== "ALL" &&
        entry.targetLocale !== glossaryLocaleFilter
      ) {
        return false;
      }

      if (!search) return true;

      return [
        entry.sourceTerm,
        entry.targetTerm ?? "",
        entry.targetLocale,
        entry.ruleType,
        entry.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [glossary, glossaryLocaleFilter, glossarySearch]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString(language === "it" ? "it-IT" : "en-US");
  };

  const formatUsd = (microusd?: number | null) => formatUsageUsd(microusd);

  const toneForStatus = (status?: string) => {
    switch (status) {
      case "COMPLETED":
      case "VALIDATED":
      case "APPROVED":
      case "PUBLISHED":
        return { bg: "#ECF7F1", fg: ACA.success };
      case "NEEDS_REVIEW":
      case "PARTIAL":
      case "REJECTED":
        return { bg: "#FFF4DF", fg: ACA.warning };
      case "FAILED":
      case "CANCELLED":
        return { bg: "#FDEAEA", fg: ACA.danger };
      case "RUNNING":
      case "GENERATING":
        return { bg: ACA.blueSoft, fg: ACA.blue };
      default:
        return { bg: ACA.cream, fg: ACA.ink };
    }
  };

  const statusBadge = (status?: string) => {
    const tone = toneForStatus(status);
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: 999,
          background: tone.bg,
          color: tone.fg,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: 0.3,
        }}
      >
        {uiTranslate(status ?? "UNKNOWN", language)}
      </span>
    );
  };

  const requireJob = () => {
    if (!selectedJobId) {
      shopify.toast.show("Select a job first.", { isError: true });
      return false;
    }
    return true;
  };

  const requireItem = () => {
    if (!selectedJobId || !selectedItemId) {
      shopify.toast.show("Select a translation item first.", {
        isError: true,
      });
      return false;
    }
    return true;
  };

  const createJob = async () => {
    const productId = targetedProductScan ? normalizeProductId(scannerProductId) : null;
    if (targetedProductScan && !productId) {
      shopify.toast.show("Enter the Shopify Product ID before creating a targeted job.", { isError: true });
      return;
    }
    if (targetedProductScan && (resourceType !== "PRODUCT" || targetLocale !== scannerLocale)) {
      shopify.toast.show("For a targeted job, select PRODUCT and use the scanned target locale.", { isError: true });
      return;
    }
    await runAction(
      "create-job",
      async () => {
        const data = await apiCall("/api/backend/translation-jobs", {
          method: "POST",
          body: JSON.stringify({
            targetLocale,
            resourceTypes: [resourceType],
            maxItems,
            ...(productId ? { shopifyProductId: productId } : {}),
          }),
        });

        await loadJobs(false);
        await loadJobDetail(data.id);
        setActiveTab("jobs");
      },
      "Translation job created.",
    );
  };

  const executeJob = async () => {
    if (!requireJob()) return;

    await runAction(
      "execute-job",
      async () => {
        await apiCall(`/api/backend/translation-jobs/${selectedJobId}/execute`, {
          method: "POST",
        });
        await loadJobDetail(selectedJobId);
        await loadJobs();
        await loadUsage();
      },
      "Job executed.",
    );
  };

  const reviewJob = async () => {
    if (!requireJob()) return;

    await runAction(
      "review-job",
      async () => {
        await apiCall(`/api/backend/translation-jobs/${selectedJobId}/review`, {
          method: "POST",
        });
        await loadJobDetail(selectedJobId);
        await loadJobs();
        await loadUsage();
      },
      "AI review completed.",
    );
  };

  const cancelJob = async () => {
    if (!requireJob()) return;

    await runAction(
      "cancel-job",
      async () => {
        await apiCall(`/api/backend/translation-jobs/${selectedJobId}/cancel`, {
          method: "POST",
        });
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Job cancelled.",
    );
  };

  const resumeJob = async () => {
    if (!requireJob()) return;

    await runAction(
      "resume-job",
      async () => {
        await apiCall(`/api/backend/translation-jobs/${selectedJobId}/resume`, {
          method: "POST",
        });
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Job resumed.",
    );
  };

  const retryFailedJob = async () => {
    if (!requireJob()) return;

    await runAction(
      "retry-failed-job",
      async () => {
        await apiCall(
          `/api/backend/translation-jobs/${selectedJobId}/retry-failed`,
          { method: "POST" },
        );
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Failed items requeued.",
    );
  };

  const approveItem = async () => {
    if (!requireItem()) return;

    await runAction(
      "approve-item",
      async () => {
        await apiCall(
          `/api/backend/translation-jobs/${selectedJobId}/items/${selectedItemId}/approve`,
          {
            method: "POST",
            body: JSON.stringify({
              approvedValue: approvedValue.trim() || undefined,
              note: approveNote.trim() || undefined,
            }),
          },
        );
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Translation approved.",
    );
  };

  const rejectItem = async () => {
    if (!requireItem()) return;

    await runAction(
      "reject-item",
      async () => {
        await apiCall(
          `/api/backend/translation-jobs/${selectedJobId}/items/${selectedItemId}/reject`,
          {
            method: "POST",
            body: JSON.stringify({ note: rejectNote.trim() }),
          },
        );
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Translation rejected.",
    );
  };

  const regenerateItem = async () => {
    if (!requireItem()) return;

    await runAction(
      "regenerate-item",
      async () => {
        const data = await apiCall(
          `/api/backend/translation-jobs/${selectedJobId}/items/${selectedItemId}/regenerate`,
          { method: "POST" },
        );

        await loadJobs(false);
        await loadJobDetail(data.id);
      },
      "Regeneration job created.",
    );
  };

  const verifyPublishedItem = async (jobId = selectedJobId, itemId = selectedItemId) => {
    setPublicationVerification(null);
    setPublicationVerificationItemId(null);
    await runAction(
      "verify-publication",
      async () => {
        const result = await apiCall(
          `/api/shopify/translation-jobs/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/verify`,
        );
        setPublicationVerification(result.verification);
        setPublicationVerificationItemId(itemId);
      },
      "Shopify read-back completed. Check verification status below.",
    );
  };

  const publishItem = async () => {
    if (!requireItem() || !selectedItem || !selectedJob) return;

    // Client-side second check only. The publication API remains the authority
    // for approved state, source freshness, Shopify shop and field ownership.
    const resourceId = selectedItem.field?.resource?.shopifyResourceId;
    if (!resourceId) {
      shopify.toast.show("Cannot publish: Shopify resource ID is missing. Refresh the job.", { isError: true });
      return;
    }
    const confirmation = [
      "Publish this APPROVED translation to Shopify?",
      `Resource: ${selectedItem.field?.resource?.resourceType ?? "UNKNOWN"} / ${resourceId}`,
      `Field: ${selectedItem.field?.key ?? "UNKNOWN"}`,
      `Locale: ${selectedJob.targetLocale}`,
      `Job: ${selectedJob.id}`,
      "This writes a translation to Shopify. It does not change the source language.",
    ].join("\n");
    if (!window.confirm(confirmation)) return;

    await runAction(
      "publish-item",
      async () => {
        await apiCall(
          `/api/shopify/translation-jobs/${selectedJobId}/items/${selectedItemId}/publish`,
          { method: "POST" },
        );
        // Shopify mutation and NestJS confirmation have already completed.
        // A failed read-back must NEVER be reported as a failed publication.
        try {
          const check = await apiCall(
            `/api/shopify/translation-jobs/${encodeURIComponent(selectedJobId)}/items/${encodeURIComponent(selectedItemId)}/verify`,
          );
          setPublicationVerification(check.verification);
        } catch {
          setPublicationVerification({ status: "VERIFICATION_FAILED", reason: "Published, but Shopify read-back could not be completed." });
        }
        setPublicationVerificationItemId(selectedItemId);
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Translation published to Shopify.",
    );
  };

  const scanStore = async () => {
    const productId = targetedProductScan ? normalizeProductId(scannerProductId) : null;
    if (targetedProductScan && (!productId || scannerResourceType !== "PRODUCT")) {
      shopify.toast.show("Enter a valid Product ID and select PRODUCT.", { isError: true });
      return;
    }
    await runAction(
      "scan-store",
      async () => {
        const data = await apiCall(
          `/api/shopify/translatable-resources?resourceType=${encodeURIComponent(
            scannerResourceType,
          )}&locale=${encodeURIComponent(scannerLocale)}${productId ? `&productId=${encodeURIComponent(scannerProductId.trim())}` : ""}`,
          { method: "POST" },
        );

        const summary =
          data?.summary ??
          {
            resources: data?.resources,
            fields: data?.fields,
            actionableFields: data?.actionableFields,
            emptySource: data?.emptySource,
            missing: data?.missing,
            translated: data?.translated,
            outdated: data?.outdated,
            coverage: data?.coverage,
          };

        setScannerResult({
          ...data,
          summary,
        });
        if (productId) {
          setResourceType("PRODUCT");
          setTargetLocale(scannerLocale);
        }
      },
      "Shopify scan completed.",
    );
  };

  const syncShopifyConfiguration = async () => {
    await runAction(
      "sync-shopify",
      async () => {
        const data = await apiCall("/api/shopify/sync", { method: "POST" });
        setSyncResult(data);
        setShopifySyncAt(new Date().toISOString());
        await loadMarketSnapshot();
      },
      "Shopify languages and markets synchronized.",
    );
  };

  const saveAiConfiguration = async () => {
    await runAction(
      "save-ai-config",
      async () => {
        const payload = {
          translationProvider: aiConfiguration.translationProvider,
          translationModel:
            aiConfiguration.translationProvider === "DEEPL"
              ? null
              : aiConfiguration.translationModel.trim() || null,
          reviewProvider: aiConfiguration.reviewProvider,
          reviewModel: aiConfiguration.reviewModel.trim() || null,
          fallbackProvider: aiConfiguration.fallbackProvider || null,
          fallbackModel:
            aiConfiguration.fallbackProvider === "DEEPL"
              ? null
              : aiConfiguration.fallbackModel.trim() || null,
        };

        await apiCall("/api/backend/ai-configuration", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      },
      "AI configuration saved.",
    );
  };

  const resetGlossaryForm = () => {
    setEditingGlossaryEntryId(null);
    setGlossaryDraft(emptyGlossaryDraft());
  };

  const editGlossaryEntry = (entry: GlossaryEntry) => {
    setEditingGlossaryEntryId(entry.id);
    setGlossaryDraft({
      sourceTerm: entry.sourceTerm,
      targetLocale: entry.targetLocale,
      targetTerm: entry.targetTerm ?? "",
      ruleType: entry.ruleType,
      caseSensitive: entry.caseSensitive,
      notes: entry.notes ?? "",
      enabled: entry.enabled,
    });
  };

  const saveGlossaryEntry = async () => {
    await runAction(
      "save-glossary-entry",
      async () => {
        if (!glossaryDraft.sourceTerm.trim()) {
          throw new Error("Source term is required.");
        }

        const payload = {
          sourceTerm: glossaryDraft.sourceTerm.trim(),
          targetLocale: glossaryDraft.targetLocale.trim() || "*",
          targetTerm:
            glossaryDraft.ruleType === "DO_NOT_TRANSLATE"
              ? null
              : glossaryDraft.targetTerm.trim() || null,
          ruleType: glossaryDraft.ruleType,
          caseSensitive: glossaryDraft.caseSensitive,
          notes: glossaryDraft.notes.trim() || null,
          enabled: glossaryDraft.enabled,
        };

        await apiCall(
          editingGlossaryEntryId
            ? `/api/backend/glossary/entries/${editingGlossaryEntryId}`
            : "/api/backend/glossary/entries",
          {
            method: editingGlossaryEntryId ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        resetGlossaryForm();
        await loadGlossary();
      },
      editingGlossaryEntryId ? "Glossary term updated." : "Glossary term added.",
    );
  };

  const toggleGlossaryEntry = async (entry: GlossaryEntry) => {
    await runAction(
      `toggle-glossary-${entry.id}`,
      async () => {
        await apiCall(`/api/backend/glossary/entries/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !entry.enabled }),
        });
        await loadGlossary();
      },
      entry.enabled ? "Glossary term disabled." : "Glossary term enabled.",
    );
  };

  const deleteGlossaryEntry = async (entry: GlossaryEntry) => {
    if (!window.confirm(`Delete glossary term "${entry.sourceTerm}"?`)) {
      return;
    }

    await runAction(
      `delete-glossary-${entry.id}`,
      async () => {
        await apiCall(`/api/backend/glossary/entries/${entry.id}`, {
          method: "DELETE",
        });
        if (editingGlossaryEntryId === entry.id) {
          resetGlossaryForm();
        }
        await loadGlossary();
      },
      "Glossary term deleted.",
    );
  };

  const exportGlossaryCsv = () => {
    const rows = [
      [
        "source_term",
        "target_locale",
        "target_term",
        "rule_type",
        "case_sensitive",
        "enabled",
        "notes",
      ],
      ...(glossary?.entries ?? []).map((entry) => [
        entry.sourceTerm,
        entry.targetLocale,
        entry.targetTerm ?? "",
        entry.ruleType,
        String(entry.caseSensitive),
        String(entry.enabled),
        entry.notes ?? "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aca-locale-glossary.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importGlossaryCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    await runAction("import-glossary", async () => {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        throw new Error("CSV contains no glossary rows.");
      }

      const header = rows[0].map((value) => value.trim().toLowerCase());
      const indexOf = (name: string) => header.indexOf(name);
      const sourceIndex = indexOf("source_term");
      const localeIndex = indexOf("target_locale");
      const targetIndex = indexOf("target_term");
      const ruleIndex = indexOf("rule_type");
      const caseIndex = indexOf("case_sensitive");
      const enabledIndex = indexOf("enabled");
      const notesIndex = indexOf("notes");

      if (sourceIndex < 0 || ruleIndex < 0) {
        throw new Error("CSV requires source_term and rule_type columns.");
      }

      let imported = 0;
      let skipped = 0;

      for (const row of rows.slice(1)) {
        const sourceTerm = row[sourceIndex]?.trim();
        if (!sourceTerm) continue;

        const rawRule = (row[ruleIndex] ?? "DO_NOT_TRANSLATE")
          .trim()
          .toUpperCase();

        if (
          rawRule !== "DO_NOT_TRANSLATE" &&
          rawRule !== "PREFERRED_TRANSLATION" &&
          rawRule !== "FORBIDDEN_TRANSLATION"
        ) {
          skipped += 1;
          continue;
        }

        try {
          await apiCall(
            "/api/backend/glossary/entries",
            {
              method: "POST",
              body: JSON.stringify({
                sourceTerm,
                targetLocale:
                  localeIndex >= 0 ? row[localeIndex]?.trim() || "*" : "*",
                targetTerm:
                  targetIndex >= 0 ? row[targetIndex]?.trim() || null : null,
                ruleType: rawRule,
                caseSensitive:
                  caseIndex >= 0
                    ? parseCsvBoolean(row[caseIndex], false)
                    : false,
                enabled:
                  enabledIndex >= 0
                    ? parseCsvBoolean(row[enabledIndex], true)
                    : true,
                notes:
                  notesIndex >= 0 ? row[notesIndex]?.trim() || null : null,
              }),
            },
            false,
          );
          imported += 1;
        } catch {
          skipped += 1;
        }
      }

      await loadGlossary();
      shopify.toast.show(
        `CSV import completed: ${imported} imported, ${skipped} skipped.`,
      );
    });
  };

  const progress = selectedJob?.totalItems
    ? Math.round((selectedJob.completedItems / selectedJob.totalItems) * 100)
    : 0;

  const canReviewJob =
    selectedJob?.status === "COMPLETED" || selectedJob?.status === "PARTIAL";
  const canCancelJob =
    selectedJob?.status === "QUEUED" || selectedJob?.status === "RUNNING";
  const canResumeJob = selectedJob?.status === "CANCELLED";
  const canRetryJob =
    selectedJob?.status === "FAILED" || selectedJob?.status === "PARTIAL";
  const canApproveItem =
    selectedItem?.status === "VALIDATED" ||
    selectedItem?.status === "NEEDS_REVIEW";
  const canRegenerateItem =
    selectedItem?.status === "VALIDATED" ||
    selectedItem?.status === "NEEDS_REVIEW" ||
    selectedItem?.status === "REJECTED";
  const canPublishItem = selectedItem?.status === "APPROVED";

  const aiCoreReadiness = useMemo(() => createAiCoreReadiness({ config: aiConfiguration, providerHealth: aiProviderHealth, budget: aiBudget }), [aiConfiguration, aiProviderHealth, aiBudget]);
  const marketLocalization = useMemo(
    () => liveMarkets !== null && liveLocales !== null
      ? summarizeLocalization(liveMarkets, liveLocales, jobs)
      : null,
    [liveMarkets, liveLocales, jobs],
  );

  return (
    <UiLanguageContext.Provider value={language}>
    <div className="aca-app-shell" lang={language}>
      <style>{responsiveCss}</style>

      <div className="aca-app-topline">
        <span style={{ background: ACA.blue }} />
        <span style={{ background: ACA.orange }} />
        <span style={{ background: ACA.green }} />
      </div>

      <header className="aca-header">
        <div className="aca-brand-block">
          <div className="aca-logo-wrap">
            <img
              src="/aca-logo-horizontal.png"
              alt="Amalfi Coast Artistry"
              className="aca-logo"
            />
          </div>
          <div>
            <div className="aca-eyebrow">ACA Locale</div>
            <h1 className="aca-title"><UiText value="Translation Operations" /></h1>
            <p className="aca-subtitle">
              <UiText value="Translation workflow, quality review and Shopify publication in one operational workspace." />
            </p>
          </div>
        </div>

        <div className="aca-header-tools">
          <label className="aca-language-picker">
            <span>{language === "it" ? "Lingua interfaccia" : "Interface language"}</span>
            <select aria-label={language === "it" ? "Lingua interfaccia" : "Interface language"} value={language} onChange={(event) => changeUiLanguage(event.target.value as UiLanguage)}>
              <option value="it">🇮🇹 Italiano</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </label>
        <div className="aca-header-stats">
          <HeaderStat label={uiTranslate("Jobs", language)} value={dashboardStats.totalJobs} color={ACA.blue} />
          <HeaderStat label={uiTranslate("Active", language)} value={dashboardStats.activeJobs} color={ACA.orange} />
          <HeaderStat label={uiTranslate("Review", language)} value={dashboardStats.reviewItems} color={ACA.green} />
          <HeaderStat label={uiTranslate("Published", language)} value={dashboardStats.publishedItems} color={ACA.blue} />
        </div>
        </div>
      </header>

      <nav className="aca-tabs" aria-label={uiTranslate("ACA Locale sections", language)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`aca-tab ${activeTab === tab.id ? "aca-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="aca-tab-label">{uiTranslate(tab.label, language)}</span>
            <span className="aca-tab-short">{uiTranslate(tab.short, language)}</span>
            {tab.id === "review" && (reviewPageData?.total ?? reviewQueue.length) > 0 ? (
              <span className="aca-tab-count">{reviewPageData?.total ?? reviewQueue.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <main className="aca-main">
        {activeTab === "overview" ? (
          <OverviewTab
            jobs={jobs}
            reviewQueue={reviewQueue}
            usageSummary={usageSummary}
            loadingUsage={loadingUsage}
            usageError={usageError}
            formatUsd={formatUsd}
            formatDateTime={formatDateTime}
            statusBadge={statusBadge}
            onGoToJobs={() => setActiveTab("jobs")}
            onGoToReview={() => setActiveTab("review")}
            onGoToScanner={() => setActiveTab("scanner")}
            onSelectJob={(jobId) => {
              setSelectedJobId(jobId);
              void loadJobDetail(jobId);
              setActiveTab("jobs");
            }}
            onSelectReview={(jobId, itemId) => {
              setSelectedJobId(jobId);
              setSelectedItemId(itemId);
              void loadJobDetail(jobId);
              setActiveTab("review");
            }}
          />
        ) : null}

        {activeTab === "scanner" ? (
          <div className="aca-layout-two">
            <Card
              title={uiTranslate("Store Scan", language)}
              subtitle="Read the latest Shopify translatable content and refresh the local translation projection."
            >
              <div className="aca-form-grid-3">
                <Field label={uiTranslate("Target locale", language)}>
                  <input
                    value={scannerLocale}
                    onChange={(event) => setScannerLocale(event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label={uiTranslate("Resource type", language)}>
                  <select
                    value={scannerResourceType}
                    onChange={(event) => setScannerResourceType(event.target.value)}
                    style={inputStyle}
                  >
                    {resourceTypes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="aca-field-action">
                  <ActionButton
                    label={uiTranslate("Scan Shopify", language)}
                    actionKey="scan-store"
                    busyAction={busyAction}
                    onClick={scanStore}
                    primary
                  />
                </div>
              </div>

              <div style={{ marginTop: 14, marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                  <input type="checkbox" checked={targetedProductScan} onChange={event => setTargetedProductScan(event.target.checked)} />
                  <UiText value="Limit scan and new jobs to one product (safe QA mode)" />
                </label>
                {targetedProductScan ? (
                  <Field label={uiTranslate("Shopify Product ID, GID or Admin product URL", language)} >
                    <input value={scannerProductId} onChange={event => setScannerProductId(event.target.value)}
                      placeholder="https://admin.shopify.com/store/your-store/products/123456789" style={inputStyle} />
                  </Field>
                ) : (
                  <InfoCallout tone="orange"><UiText value="Full resource-type scan enabled. This may update scanner states for every product. No translation is published by scanning." /></InfoCallout>
                )}
                {targetedProductScan ? (
                  <InfoCallout tone="blue"><UiText value="Targeted scan reads and updates only the selected PRODUCT. New jobs are also restricted to that Product ID while safe QA mode remains enabled. Product variants and metafields are not included automatically." /></InfoCallout>
                ) : null}
              </div>
              <InfoCallout tone="blue">
                {targetedProductScan ? "Only the specified product is refreshed; other products remain unchanged." : "A complete scan updates MISSING, TRANSLATED, OUTDATED and EMPTY_SOURCE states for all resources of the selected type."}
              </InfoCallout>
            </Card>

            <Card
              title={uiTranslate("Scan Result", language)}
              subtitle="Coverage and translation state for the last completed scan."
            >
              {scannerResult?.summary ? (
                <>
                  <div className="aca-stat-grid-4">
                    <MiniStat label={uiTranslate("Resources", language)} value={String(scannerResult.summary.resources ?? 0)} />
                    <MiniStat label={uiTranslate("Fields", language)} value={String(scannerResult.summary.fields ?? 0)} />
                    <MiniStat label={uiTranslate("Missing", language)} value={String(scannerResult.summary.missing ?? 0)} />
                    <MiniStat label={uiTranslate("Outdated", language)} value={String(scannerResult.summary.outdated ?? 0)} />
                  </div>
                  <div className="aca-stat-grid-3" style={{ marginTop: 12 }}>
                    <MiniStat label={uiTranslate("Translated", language)} value={String(scannerResult.summary.translated ?? 0)} />
                    <MiniStat label={uiTranslate("Empty source", language)} value={String(scannerResult.summary.emptySource ?? 0)} />
                    <MiniStat label={uiTranslate("Coverage", language)} value={`${scannerResult.summary.coverage ?? 0}%`} />
                  </div>
                </>
              ) : (
                <EmptyState
                  title={uiTranslate("No scan yet", language)}
                  text="Choose a locale and resource type, then run a Shopify scan."
                />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "seo" ? (
          <div className="aca-layout-two">
            <Card title={uiTranslate("International SEO — Existing Translations", language)} subtitle="Read-only inspection of translated SEO fields present in currently loaded job details. No Shopify writes.">
              <InfoCallout tone="orange"><UiText value="Partial audit: the Jobs API loads details for up to 15 jobs. Counts below do not cover the full store, Shopify Markets configuration, hreflang, live URLs, or images not represented as translation fields." /></InfoCallout>
              <div className="aca-form-grid-3" style={{ marginTop: 14 }}>
                <Field label={uiTranslate("Target locale", language)}>
                  <select value={seoLocale} onChange={event => setSeoLocale(event.target.value)} style={inputStyle}>
                    <option value="ALL">{uiTranslate("All loaded locales", language)}</option>
                    {Array.from(new Set(jobs.map(job => job.targetLocale))).sort().map(locale => <option key={locale} value={locale}>{locale}</option>)}
                  </select>
                </Field>
                <Field label={uiTranslate("Issue filter", language)}>
                  <select value={seoFilter} onChange={event => setSeoFilter(event.target.value)} style={inputStyle}>
                    <option value="ALL">{uiTranslate("All results", language)}</option>
                    <option value="ERROR">{uiTranslate("Errors", language)}</option>
                    <option value="REVIEW">{uiTranslate("Needs review", language)}</option>
                    <option value="PASS">{uiTranslate("Pass", language)}</option>
                  </select>
                </Field>
                <div className="aca-field-action"><button type="button" className="aca-btn" onClick={() => void loadJobs(true)} disabled={loadingJobs}>{loadingJobs ? "Refreshing..." : "Refresh loaded jobs"}</button></div>
              </div>
              <div className="aca-stat-grid-4" style={{ marginTop: 14 }}>
                <MiniStat label={uiTranslate("SEO fields evaluated", language)} value={String(seoAudit.evaluated)} />
                <MiniStat label={uiTranslate("Pass", language)} value={String(seoAudit.passing)} />
                <MiniStat label={uiTranslate("Needs review", language)} value={String(seoAudit.review)} />
                <MiniStat label={uiTranslate("Errors", language)} value={String(seoAudit.errors)} />
              </div>
              {jobsError ? <InfoCallout tone="orange">{jobsError}</InfoCallout> : null}
              {seoVisibleRows.length ? (
                <div className="aca-seo-table-wrap" role="region" aria-label="SEO translation audit results" tabIndex={0}>
                  <table className="aca-seo-table">
                    <thead>
                      <tr><th scope="col"><UiText value="Locale" /></th><th scope="col"><UiText value="Resource" /></th><th scope="col"><UiText value="Field" /></th><th scope="col"><UiText value="Status" /></th><th scope="col"><UiText value="Length" /></th><th scope="col"><UiText value="Notes" /></th></tr>
                    </thead>
                    <tbody>
                      {seoVisibleRows.map((row, index) => (
                        <tr key={`${row.locale}:${row.resourceType ?? ""}:${row.key}:${index}`}>
                          <td><span className="aca-seo-locale">{row.locale}</span></td>
                          <td><span className="aca-seo-resource">{row.resourceType}</span></td>
                          <td><span className="aca-seo-field">{row.key}</span></td>
                          <td><span className={`aca-seo-status aca-seo-status--${row.audit.status === "PASS" ? "pass" : row.audit.status === "ERROR" ? "error" : "review"}`}>{row.audit.status}</span></td>
                          <td className="aca-seo-length">{row.audit.length}</td>
                          <td className="aca-seo-notes">{row.audit.findings.map(issue => issue.message).join(" ") || "No heuristic issues"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="aca-muted-small" style={{ marginTop: 14 }}><UiText value="No matching SEO translation fields in the currently loaded jobs." /></p>}
              {seoAudit.rows.length > 50 ? <p className="aca-muted-small"><UiText value="Showing the first 50 matching fields only." /></p> : null}
            </Card>
            <Card title={uiTranslate("SEO Draft Checker", language)} subtitle="Evaluate a proposed translation before approval. Nothing is saved or published.">
              <div className="aca-form-grid-3">
                <Field label={uiTranslate("Field", language)}>
                  <select value={seoField} onChange={event => setSeoField(event.target.value)} style={inputStyle}>
                    <option value="meta_title">{uiTranslate("SEO title", language)}</option>
                    <option value="meta_description">{uiTranslate("Meta description", language)}</option>
                    <option value="handle">{uiTranslate("Localized slug / handle", language)}</option>
                    <option value="image_alt">{uiTranslate("Image ALT text", language)}</option>
                  </select>
                </Field>
              </div>
              <Field label={uiTranslate("Proposed translation", language)}>
                <textarea value={seoValue} onChange={event => setSeoValue(event.target.value)} rows={5} style={{ ...inputStyle, width: "100%" }} placeholder={uiTranslate("Paste a proposed localized SEO text...", language)} />
              </Field>
              <div className="aca-stat-grid-3" style={{ marginTop: 14 }}>
                <MiniStat label={uiTranslate("Characters", language)} value={String(seoDraft.length)} />
                <MiniStat label={uiTranslate("Heuristic status", language)} value={seoDraft.status} />
                <MiniStat label={uiTranslate("Findings", language)} value={String(seoDraft.findings.length)} />
              </div>
              {seoDraft.findings.map((issue, index) => <InfoCallout key={`${issue.code}-${index}`} tone={issue.severity === "ERROR" ? "orange" : "blue"}>{issue.message}</InfoCallout>)}
              <p className="aca-muted-small" style={{ marginTop: 14 }}><UiText value="Length ranges are editorial heuristics, not Shopify or Google ranking guarantees. This checker does not validate live hreflang tags, canonical URLs, search indexation, Shopify Markets routing, or actual image accessibility." /></p>
            </Card>
          </div>
        ) : null}

        {activeTab === "operations" ? (
          <div className="aca-column-stack">
            <Card title={uiTranslate("Operations & Health", language)} subtitle="Read-only, shop-scoped operational snapshot. Host infrastructure is monitored separately by the administrator CLI.">
              <div className="aca-actions">
                <button type="button" className="aca-btn" disabled={operationsLoading} onClick={() => void loadOperations()}>
                  {operationsLoading ? 'Refreshing...' : 'Refresh snapshot'}
                </button>
              </div>
              {operationsError ? <InfoCallout tone="orange"><UiText value="Unable to load operations:" /> {operationsError}</InfoCallout> : null}
              {operations ? <>
                <p style={mutedTextStyle}><UiText value="Overall status:" /> <strong style={{ color: operations.state === 'DEGRADED' ? ACA.danger : operations.state === 'RECOVERED' ? ACA.warning : ACA.success }}>{operations.state}</strong> <UiText value="· Snapshot:" /> {new Date(operations.snapshotAt).toLocaleString()} <UiText value="· Window:" /> {operations.periodHours}h</p>
                <div className="aca-stat-grid-4">
                  <MiniStat label={uiTranslate("Failed jobs", language)} value={String(operations.shop.jobsFailed)} />
                  <MiniStat label={uiTranslate("Stale running", language)} value={String(operations.shop.jobsStaleRunning)} />
                  <MiniStat label={uiTranslate("Due retries", language)} value={String(operations.shop.jobsDueRetry)} />
                  <MiniStat label={uiTranslate("Failed items", language)} value={String(operations.shop.itemsFailed)} />
                  <MiniStat label={uiTranslate("Failed webhooks", language)} value={String(operations.shop.webhooksFailed)} />
                  <MiniStat label={uiTranslate("Stale webhooks", language)} value={String(operations.shop.webhooksStaleProcessing)} />
                  <MiniStat label={uiTranslate("Provider errors (24h)", language)} value={String(operations.errors24h)} />
                  <MiniStat label={uiTranslate("Providers observed", language)} value={String(operations.providers.length)} />
                </div>
                <div style={{ marginTop: 18 }}>
                  <strong><UiText value="Provider activity (last 24 hours)" /></strong>
                  {operations.providers.length ? (
                    <div className="aca-ops-provider-grid">
                      {operations.providers.map(provider => (
                        <div className="aca-ops-provider-card" key={provider.provider}>
                          <div className="aca-ops-provider-heading">
                            <strong>{provider.provider}</strong>
                            <span className={`aca-ops-provider-state aca-ops-provider-state--${provider.state.toLowerCase()}`}>{provider.state}</span>
                          </div>
                          <div className="aca-ops-provider-counts">
                            <span><strong>{provider.successes24h}</strong> <UiText value="successful" /></span>
                            <span><strong>{provider.errors24h}</strong> failed</span>
                          </div>
                          <div className="aca-ops-provider-dates">
                            {provider.lastSuccessAt ? <span><UiText value="Last success:" /> {new Date(provider.lastSuccessAt).toLocaleString()}</span> : null}
                            {provider.lastErrorAt ? <span><UiText value="Last error:" /> {new Date(provider.lastErrorAt).toLocaleString()}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={mutedTextStyle}><UiText value="No provider activity recorded within the last 24 hours. Availability is unknown." /></p>}
                </div>
                <p style={mutedTextStyle}>{operations.note} <UiText value="The CLI on the VPS separately reports Docker health, disk and backup freshness." /></p>
              </> : !operationsLoading && !operationsError ? <p style={mutedTextStyle}><UiText value="Open this tab to retrieve a read-only snapshot." /></p> : null}
            </Card>
          </div>
        ) : null}

        {activeTab === "jobs" ? (
          <div className="aca-layout-jobs">
            <div className="aca-column-stack">
              <Card title={uiTranslate("Translation Automation Monitor", language)} subtitle="Read-only 30-day Shopify change and automatic job recovery snapshot. No jobs or retries are triggered.">
                <div className="aca-actions">
                  <button type="button" className="aca-btn" onClick={() => void loadAutomationMonitor()} disabled={automationMonitorLoading}>
                    {automationMonitorLoading ? 'Refreshing...' : 'Refresh automation status'}
                  </button>
                </div>
                {automationMonitorError ? <p style={{ color: ACA.danger }}>{automationMonitorError}</p> : null}
                {automationMonitor ? <>
                  <div className="aca-stat-grid-4" style={{ marginTop: 12 }}>
                    <MiniStat label={uiTranslate("Change events (30d)", language)} value={String(automationMonitor.events.total)} />
                    <MiniStat label={uiTranslate("Failed events", language)} value={String(automationMonitor.events.FAILED)} />
                    <MiniStat label={uiTranslate("Automatic jobs", language)} value={String(automationMonitor.automaticJobs.total)} />
                    <MiniStat label={uiTranslate("Jobs with retry scheduled", language)} value={String(automationMonitor.pendingRetries)} />
                  </div>
                  <p style={mutedTextStyle}><UiText value="Webhook events:" /> {automationMonitor.events.COMPLETED} <UiText value="completed," /> {automationMonitor.events.PROCESSING} <UiText value="processing," /> {automationMonitor.events.FAILED} <UiText value="failed." /></p>
                  <p style={mutedTextStyle}><UiText value="Automation stages:" /> {Object.entries(automationMonitor.automaticJobs.stages).map(([stage, count]) => `${stage}: ${count}`).join(' · ') || 'No automatic jobs in the last 30 days'}.</p>
                  {automationMonitor.recentFailures.length > 0 ? <div>
                    <strong><UiText value="Recent failed changes (max 10)" /></strong>
                    {automationMonitor.recentFailures.map(event => <p key={event.id} style={mutedTextStyle}>
                      {event.resourceType} · {event.topic} · {event.attempts} <UiText value="attempts ·" /> {new Date(event.createdAt).toLocaleString()}
                    </p>)}
                  </div> : null}
                  <p style={mutedTextStyle}>{automationMonitor.note}</p>
                </> : !automationMonitorLoading ? <p style={mutedTextStyle}><UiText value="Open this tab to load a shop-scoped snapshot." /></p> : null}
              </Card>
              <Card title="Create Job" subtitle="Create and enqueue a background translation job.">
                <div className="aca-form-grid-3">
                  <Field label={uiTranslate("Target locale", language)}>
                    <input
                      value={targetLocale}
                      onChange={(event) => setTargetLocale(event.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={uiTranslate("Resource type", language)}>
                    <select
                      value={resourceType}
                      onChange={(event) => setResourceType(event.target.value)}
                      style={inputStyle}
                    >
                      {resourceTypes.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={uiTranslate("Max items", language)}>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={maxItems}
                      onChange={(event) => setMaxItems(Number(event.target.value) || 1)}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div className="aca-actions">
                  <ActionButton
                    label="Create Job"
                    actionKey="create-job"
                    busyAction={busyAction}
                    onClick={createJob}
                    primary
                  />
                  <ActionButton
                    label={uiTranslate("Refresh", language)}
                    actionKey="refresh-jobs"
                    busyAction={busyAction}
                    onClick={() =>
                      void runAction(
                        "refresh-jobs",
                        async () => {
                          await loadJobs(false);
                          if (selectedJobId) await loadJobDetail(selectedJobId);
                        },
                        "Jobs refreshed.",
                      )
                    }
                  />
                </div>
              </Card>

              <Card title={uiTranslate("Jobs", language)} subtitle="Search and filter translation job history.">
                <div className="aca-filter-row">
                  <input
                    value={jobSearch}
                    onChange={(event) => setJobSearch(event.target.value)}
                    placeholder={uiTranslate("Search job, locale, provider…", language)}
                    style={inputStyle}
                  />
                  <select
                    value={jobStatusFilter}
                    onChange={(event) => setJobStatusFilter(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="ALL">{uiTranslate("All statuses", language)}</option>
                    <option value="QUEUED">{uiTranslate("QUEUED", language)}</option>
                    <option value="RUNNING">{uiTranslate("RUNNING", language)}</option>
                    <option value="COMPLETED">{uiTranslate("COMPLETED", language)}</option>
                    <option value="PARTIAL">{uiTranslate("PARTIAL", language)}</option>
                    <option value="FAILED">{uiTranslate("FAILED", language)}</option>
                    <option value="CANCELLED">{uiTranslate("CANCELLED", language)}</option>
                  </select>
                </div>

                {loadingJobs ? (
                  <p style={mutedTextStyle}><UiText value="Loading jobs…" /></p>
                ) : jobsError ? (
                  <p style={{ ...mutedTextStyle, color: ACA.danger }}>{jobsError}</p>
                ) : filteredJobs.length === 0 ? (
                  <EmptyState title={uiTranslate("No jobs found", language)} text="Create a job or change your filters." />
                ) : (
                  <div className="aca-job-list">
                    {filteredJobs.map((job) => (
                      <JobListItem
                        key={job.id}
                        job={job}
                        selected={job.id === selectedJobId}
                        statusBadge={statusBadge}
                        formatDateTime={formatDateTime}
                        onClick={() => {
                          setSelectedJobId(job.id);
                          setSelectedItemId(job.items?.[0]?.id ?? "");
                          void loadJobDetail(job.id);
                        }}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card
              title={uiTranslate("Job Detail", language)}
              subtitle="Lifecycle, progress, providers and item-level status."
            >
              {selectedJob ? (
                <>
                  <div className="aca-stat-grid-4">
                    <MiniStat label={uiTranslate("Status", language)} valueNode={statusBadge(selectedJob.status)} />
                    <MiniStat
                      label={uiTranslate("Translation", language)}
                      value={`${selectedJob.provider ?? "—"}${selectedJob.model ? ` · ${selectedJob.model}` : ""}`}
                    />
                    <MiniStat
                      label={uiTranslate("AI review", language)}
                      value={`${selectedJob.reviewProvider ?? "—"}${selectedJob.reviewModel ? ` · ${selectedJob.reviewModel}` : ""}`}
                    />
                    <MiniStat label={uiTranslate("Progress", language)} value={`${progress}%`} />
                  </div>

                  <ProgressBar
                    value={progress}
                    label={`${selectedJob.completedItems}/${selectedJob.totalItems} completed · ${selectedJob.failedItems} failed`}
                  />

                  <div className="aca-stat-grid-3">
                    <MiniStat label={uiTranslate("Started", language)} value={formatDateTime(selectedJob.startedAt)} />
                    <MiniStat label={uiTranslate("Completed", language)} value={formatDateTime(selectedJob.completedAt)} />
                    <MiniStat label={uiTranslate("Error", language)} value={selectedJob.errorMessage ?? "None"} />
                  </div>

                  <div className="aca-actions" style={{ marginTop: 18 }}>
                    {selectedJob.status === "QUEUED" ? (
                      <ActionButton
                        label={uiTranslate("Execute now", language)}
                        actionKey="execute-job"
                        busyAction={busyAction}
                        onClick={executeJob}
                      />
                    ) : null}
                    {canReviewJob ? (
                      <ActionButton
                        label={uiTranslate("Run AI Review", language)}
                        actionKey="review-job"
                        busyAction={busyAction}
                        onClick={reviewJob}
                        primary
                      />
                    ) : null}
                    {canRetryJob ? (
                      <ActionButton
                        label={uiTranslate("Retry Failed", language)}
                        actionKey="retry-failed-job"
                        busyAction={busyAction}
                        onClick={retryFailedJob}
                      />
                    ) : null}
                    {canResumeJob ? (
                      <ActionButton
                        label={uiTranslate("Resume", language)}
                        actionKey="resume-job"
                        busyAction={busyAction}
                        onClick={resumeJob}
                      />
                    ) : null}
                    {canCancelJob ? (
                      <ActionButton
                        label={uiTranslate("Cancel", language)}
                        actionKey="cancel-job"
                        busyAction={busyAction}
                        onClick={cancelJob}
                        destructive
                      />
                    ) : null}
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <h3 style={sectionHeadingStyle}><UiText value="Items" /></h3>
                    <div className="aca-item-table-wrap">
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={tableHeadCellStyle}><UiText value="Field" /></th>
                            <th style={tableHeadCellStyle}><UiText value="Resource" /></th>
                            <th style={tableHeadCellStyle}><UiText value="Status" /></th>
                            <th style={tableHeadCellStyle}><UiText value="Provider" /></th>
                            <th style={tableHeadCellStyle}><UiText value="AI score" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedJob.items ?? []).map((item) => (
                            <tr
                              key={item.id}
                              onClick={() => {
                                setSelectedItemId(item.id);
                                setActiveTab("review");
                              }}
                              style={{ cursor: "pointer" }}
                            >
                              <td style={tableBodyCellStyle}>{item.field?.key ?? "—"}</td>
                              <td style={tableBodyCellStyle}>{item.field?.resource?.resourceType ?? "—"}</td>
                              <td style={tableBodyCellStyle}>{statusBadge(item.status)}</td>
                              <td style={tableBodyCellStyle}>{item.provider ?? "—"}</td>
                              <td style={tableBodyCellStyle}>{item.aiReviewScore ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState title={uiTranslate("Select a job", language)} text="Choose a job from the list to inspect its lifecycle and items." />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="aca-layout-review">
            <Card title={uiTranslate("Review Queue & History", language)} subtitle="All statuses shows items awaiting review. Select Approved, Published or Rejected to view history. Filters are scoped to this shop; approvals never publish automatically.">
              <div className="aca-review-filters">
                <input aria-label={uiTranslate("Search review queue", language)} placeholder={uiTranslate("Search field, source text or product ID", language)}
                  value={reviewSearch} onChange={(event) => { setReviewSearch(event.target.value); setReviewPageNumber(1); setSelectedReviewIds([]); }} style={inputStyle} />
                <select aria-label={uiTranslate("Review target language", language)} value={reviewLocale} onChange={(event) => { setReviewLocale(event.target.value); setReviewPageNumber(1); setSelectedReviewIds([]); }} style={inputStyle}>
                  <option value="ALL">{uiTranslate("All languages", language)}</option>
                  {Array.from(new Set([...reviewLocales, ...jobs.map((job) => job.targetLocale)])).sort().map((locale) => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}
                </select>
                <select aria-label={uiTranslate("Review resource type", language)} value={reviewType} onChange={(event) => { setReviewType(event.target.value); setReviewPageNumber(1); setSelectedReviewIds([]); }} style={inputStyle}>
                  <option value="ALL">{uiTranslate("All resource types", language)}</option>
                  {Array.from(new Set([...reviewTypes, ...resourceTypes])).sort().map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select aria-label={uiTranslate("Review status", language)} value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value); setReviewPageNumber(1); setSelectedReviewIds([]); }} style={inputStyle}>
                  <option value="ALL">{uiTranslate("All statuses", language)}</option>
                  <option value="VALIDATED">{uiTranslate("Validated", language)}</option>
                  <option value="NEEDS_REVIEW">{uiTranslate("Needs review", language)}</option>
                  <option value="APPROVED">{uiTranslate("Approved (history)", language)}</option>
                  <option value="PUBLISHED">{uiTranslate("Published (history)", language)}</option>
                  <option value="REJECTED">{uiTranslate("Rejected (history)", language)}</option>
                </select>
              </div>
              <div className="aca-actions" style={{ margin: "12px 0" }}>
                <span className="aca-muted-small">{filteredReviewQueue.length} <UiText value="on page ·" /> {reviewPageData?.total ?? "—"} <UiText value="total ·" /> {selectedReviewIds.length} <UiText value="selected" /></span>
                <button type="button" className="aca-mini-action" disabled={busyAction !== null} onClick={() => {
                  const visibleIds = filteredReviewQueue.filter(({ item }) => (item.status === "VALIDATED" || item.status === "NEEDS_REVIEW") && Boolean(item.translatedValue?.trim()) && qualitySnapshot(item).state !== "BLOCKED").map(({ item }) => item.id);
                  setSelectedReviewIds((current) => Array.from(new Set([...current, ...visibleIds])));
                }}><UiText value="Select filtered" /></button>
                <button type="button" className="aca-mini-action" onClick={() => setSelectedReviewIds([])}><UiText value="Clear selection" /></button>
                <button type="button" className="aca-mini-action" disabled={busyAction !== null || selectedReviewIds.length === 0}
                  onClick={() => void bulkApproveSelected()}>
                  {busyAction === "bulk-approve" ? "Approving…" : "Approve selected (no publish)"}
                </button>
              </div>
              {reviewPageLoading ? <p className="aca-muted-small"><UiText value="Loading review queue…" /></p> : null}
              {reviewPageError ? <p role="alert" style={{ color: ACA.danger }}>{reviewPageError}</p> : null}
              {!reviewPageLoading && !reviewPageError && filteredReviewQueue.length === 0 ? (
                <EmptyState title={uiTranslate("No translations match the selected filters", language)} text="All statuses shows actionable review items. Select Published or another history status to inspect completed work." />
              ) : (
                <div className="aca-review-list">
                  {filteredReviewQueue.map(({ job, item }) => (
                    <div key={item.id} className="aca-review-choice">
                      <input type="checkbox" aria-label={`Select ${item.field?.key ?? item.id}`}
                        checked={selectedReviewIds.includes(item.id)}
                        disabled={(item.status !== "VALIDATED" && item.status !== "NEEDS_REVIEW") || !item.translatedValue?.trim() || qualitySnapshot(item).state === "BLOCKED" || busyAction !== null}
                        onChange={(event) => setSelectedReviewIds((current) => event.target.checked
                          ? [...current.filter((id) => id !== item.id), item.id]
                          : current.filter((id) => id !== item.id))} />
                    <button
                      type="button"
                      className={`aca-review-row ${item.id === selectedItemId ? "aca-review-row-active" : ""}`}
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setSelectedItemId(item.id);
                        void loadJobDetail(job.id);
                      }}
                    >
                      <div>
                        <strong>{item.field?.key ?? "Translation field"}</strong>
                        <div className="aca-muted-small">
                          {item.field?.resource?.resourceType ?? "—"} · {job.sourceLocale} → {job.targetLocale}
                        </div>
                        <div className="aca-muted-small" title={item.field?.resource?.shopifyResourceId ?? "Resource ID unavailable"} style={{ overflowWrap: "anywhere" }}>
                          <UiText value="Resource:" /> {item.field?.resource?.shopifyResourceId ?? "Unavailable"}
                        </div>
                        <div className="aca-muted-small" title={job.id} style={{ overflowWrap: "anywhere" }}>
                          <UiText value="Job:" /> {job.id}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {statusBadge(item.status)}
                        <div className="aca-muted-small" style={{ marginTop: 6 }}>
                          <UiText value="Technical QA" /> {qualitySnapshot(item).score === null ? "not checked" : `${qualitySnapshot(item).score}/100 · ${qualitySnapshot(item).state}`} <UiText value="· AI" /> {item.aiReviewScore ?? "—"}
                        </div>
                      </div>
                    </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="aca-actions" style={{ marginTop: 12 }}>
                <button type="button" className="aca-mini-action" disabled={reviewPageNumber <= 1 || reviewPageLoading}
                  onClick={() => { setSelectedReviewIds([]); setReviewPageNumber((n) => Math.max(1, n - 1)); }}><UiText value="Previous" /></button>
                <span className="aca-muted-small"><UiText value="Page" /> {reviewPageNumber} / {reviewPageData?.pages ?? 1}</span>
                <button type="button" className="aca-mini-action" disabled={reviewPageNumber >= (reviewPageData?.pages ?? 1) || reviewPageLoading}
                  onClick={() => { setSelectedReviewIds([]); setReviewPageNumber((n) => n + 1); }}><UiText value="Next" /></button>
                <button type="button" className="aca-mini-action" onClick={() => setReviewRefreshKey((n) => n + 1)}><UiText value="Refresh" /></button>
              </div>
            </Card>

            <Card
              title={uiTranslate("Human Review", language)}
              subtitle="Compare source and generated text, edit the final value and publish after approval."
            >
              {selectedItem && selectedJob ? (
                <div className="aca-column-stack">
                  <div style={{ border: "1px solid #d4d9e1", borderRadius: 10, padding: 12 }}>
                    <strong><UiText value="Shopify resource identity" /></strong>
                    <div className="aca-muted-small" style={{ overflowWrap: "anywhere", marginTop: 6 }}>
                      <UiText value="Resource:" /> {selectedItem.field?.resource?.resourceType ?? "UNKNOWN"} / {selectedItem.field?.resource?.shopifyResourceId ?? "Unavailable"}
                    </div>
                    <div className="aca-muted-small" style={{ overflowWrap: "anywhere", marginTop: 4 }}>
                      <UiText value="Job:" /> {selectedJob.id} <UiText value="· Item:" /> {selectedItem.id} <UiText value="· Target locale:" /> {selectedJob.targetLocale}
                    </div>
                  </div>
                  <div className="aca-stat-grid-4">
                    <MiniStat label={uiTranslate("Status", language)} valueNode={statusBadge(selectedItem.status)} />
                    <MiniStat label={uiTranslate("Field", language)} value={selectedItem.field?.key ?? "—"} />
                    <MiniStat label={uiTranslate("Type", language)} value={selectedItem.field?.type ?? "—"} />
                    <MiniStat label={uiTranslate("AI score", language)} value={selectedItem.aiReviewScore?.toString() ?? "—"} />
                  </div>

                  <div className="aca-column-stack" style={{ border: "1px solid #d4d9e1", borderRadius: 10, padding: 14 }}>
                    <h3 style={sectionHeadingStyle}><UiText value="Translation Quality Studio" /></h3>
                    <p className="aca-muted-small"><UiText value="Deterministic technical checks from the generated translation. This is not a linguistic quality rating. Edited approval text is validated again on the server." /></p>
                    <div className="aca-stat-grid-4">
                      <MiniStat label={uiTranslate("Technical score", language)} value={qualitySnapshot(selectedItem).score === null ? "Not checked" : `${qualitySnapshot(selectedItem).score}/100`} />
                      <MiniStat label={uiTranslate("Gate", language)} value={qualitySnapshot(selectedItem).state} />
                      <MiniStat label={uiTranslate("Critical issues", language)} value={String(qualitySnapshot(selectedItem).errors)} />
                      <MiniStat label={uiTranslate("Warnings", language)} value={String(qualitySnapshot(selectedItem).warnings)} />
                    </div>
                    {qualitySnapshot(selectedItem).state === "BLOCKED" ? <InfoCallout tone="orange"><UiText value="Critical deterministic issues detected. Server approval validation must pass before publication. Regenerate or correct the translation." /></InfoCallout> : null}
                    {qualitySnapshot(selectedItem).state === "NOT_CHECKED" ? <InfoCallout tone="orange"><UiText value="No saved deterministic validation snapshot. A score cannot be computed. Server validation remains authoritative." /></InfoCallout> : null}
                    {qualitySnapshot(selectedItem).issues.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {qualitySnapshot(selectedItem).issues.map((issue, index) => (
                          <div key={`${issue.code}-${index}`} style={{ border: "1px solid #d4d9e1", borderRadius: 7, padding: 10 }}>
                            <strong>{issue.severity} · {issue.group} · {issue.code}</strong>
                            <div className="aca-muted-small">{issue.message}</div>
                          </div>
                        ))}
                        {qualitySnapshot(selectedItem).moreIssues > 0 ? <p className="aca-muted-small"><UiText value="Additional stored issues:" /> {qualitySnapshot(selectedItem).moreIssues}</p> : null}
                      </div>
                    ) : null}
                  </div>

                  {selectedJob.items && selectedJob.items.length > 1 ? (
                    <Field label={uiTranslate("Translation item", language)}>
                      <select
                        value={selectedItemId}
                        onChange={(event) => setSelectedItemId(event.target.value)}
                        style={inputStyle}
                      >
                        {selectedJob.items.map((item, index) => (
                          <option key={item.id} value={item.id}>
                            {index + 1}. {item.field?.key ?? "field"} · {item.status}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}

                  <div className="aca-two-column">
                    <ReadOnlyBlock label={uiTranslate("Source value", language)} value={selectedItem.sourceValue} />
                    <ReadOnlyBlock label={uiTranslate("Generated translation", language)} value={selectedItem.translatedValue ?? "—"} />
                  </div>

                  {selectedItem.aiReviewSuggestedTranslation ? (
                    <ReadOnlyBlock
                      label={uiTranslate("AI suggested translation", language)}
                      value={selectedItem.aiReviewSuggestedTranslation}
                      accent="green"
                    />
                  ) : null}

                  <Field label={uiTranslate("Approved value", language)}>
                    <textarea
                      value={approvedValue}
                      onChange={(event) => setApprovedValue(event.target.value)}
                      style={{ ...inputStyle, minHeight: 150, resize: "vertical" }}
                    />
                  </Field>

                  <div className="aca-two-column">
                    <Field label={uiTranslate("Approval note", language)}>
                      <textarea
                        value={approveNote}
                        onChange={(event) => setApproveNote(event.target.value)}
                        style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                      />
                    </Field>
                    <Field label={uiTranslate("Rejection note", language)}>
                      <textarea
                        value={rejectNote}
                        onChange={(event) => setRejectNote(event.target.value)}
                        style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                      />
                    </Field>
                  </div>

                  <div className="aca-actions">
                    {canApproveItem ? (
                      <ActionButton
                        label={uiTranslate("Approve", language)}
                        actionKey="approve-item"
                        busyAction={busyAction}
                        onClick={approveItem}
                        primary
                      />
                    ) : null}
                    {canApproveItem ? (
                      <ActionButton
                        label={uiTranslate("Reject", language)}
                        actionKey="reject-item"
                        busyAction={busyAction}
                        onClick={rejectItem}
                        destructive
                      />
                    ) : null}
                    {canRegenerateItem ? (
                      <ActionButton
                        label={uiTranslate("Regenerate", language)}
                        actionKey="regenerate-item"
                        busyAction={busyAction}
                        onClick={regenerateItem}
                      />
                    ) : null}
                    {canPublishItem ? (
                      <ActionButton
                        label={uiTranslate("Publish to Shopify", language)}
                        actionKey="publish-item"
                        busyAction={busyAction}
                        onClick={publishItem}
                        success
                      />
                    ) : null}
                    {selectedItem.status === "PUBLISHED" ? (
                      <>
                        <span className="aca-published-note"><UiText value="Published to Shopify" /></span>
                        <ActionButton
                          label={uiTranslate("Verify on Shopify", language)}
                          actionKey="verify-publication"
                          busyAction={busyAction}
                          onClick={() => verifyPublishedItem()}
                        />
                      </>
                    ) : null}
                  </div>
                  {selectedItem.status === "PUBLISHED" &&
                    publicationVerificationItemId === selectedItem.id && publicationVerification ? (
                    <div role="status" style={{ marginTop: 12, padding: 12, border: "1px solid #d9d6c8", borderRadius: 8 }}>
                      <strong><UiText value="Shopify read-back:" /> {publicationVerification.status}</strong>
                      {publicationVerification.verifiedAt ? <p><UiText value="Checked:" /> {publicationVerification.verifiedAt}</p> : null}
                      {publicationVerification.reason ? <p>{publicationVerification.reason}</p> : null}
                      {publicationVerification.status === "MISMATCH" ?
                        <p><UiText value="Shopify value differs from the approved translation or is outdated. Do not republish without reviewing the source." /></p> : null}
                      {publicationVerification.status === "VERIFIED" ?
                        <p><UiText value="Exact approved value confirmed in Shopify for this field and locale." /></p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyState title={uiTranslate("Select an item", language)} text="Choose a translation from the review queue or a job detail." />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "markets" ? (
          <div className="aca-column-stack">
            <Card title={uiTranslate("Markets & Localization", language)} subtitle="Live read-only Shopify Markets and published locales. Country-level translation coverage is not inferred from job history.">
              <div className="aca-actions">
                <button type="button" className="aca-btn" disabled={marketsLoading} onClick={() => void loadMarketSnapshot()}>
                  {marketsLoading ? "Loading Shopify Markets..." : "Refresh Shopify Markets (read only)"}
                </button>
              </div>
              <div style={{ marginTop: 12, padding: 14, border: "1px solid #d9d6c8", borderRadius: 8 }}>
                <strong><UiText value="Shopify language and market synchronization" /></strong>
                <p className="aca-muted-small"><UiText value="Shopify is the source of truth. Synchronize ACA Locale after changing store languages or market configuration. The button is an action, not a persistent toggle." /></p>
                <div className="aca-actions">
                  <ActionButton label={uiTranslate("Sync Shopify configuration", language)} actionKey="sync-shopify" busyAction={busyAction} onClick={syncShopifyConfiguration} primary />
                </div>
                <div role="status" style={{ marginTop: 8 }}>
                  {shopifySyncAt ? `Last successful configuration sync in this session: ${new Date(shopifySyncAt).toLocaleString()}` : "No configuration synchronization performed in this session."}
                  {syncResult ? <p className="aca-muted-small"><UiText value="Configuration sync completed. Live language and market information refreshed separately from Shopify." /></p> : null}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <InfoCallout tone="orange">
                  <UiText value="Market configuration comes from Shopify Admin; ACA job counts are matched by language only and are NOT market-specific publication or storefront translation coverage. No Shopify writes are performed." />
                </InfoCallout>
              </div>
              {marketsError ? <div style={{ marginTop: 12 }}><InfoCallout tone="orange"><UiText value="Shopify Markets lookup failed:" /> {marketsError}</InfoCallout></div> : null}
              {marketSnapshotAt ? <p className="aca-muted-small"><UiText value="Snapshot:" /> {new Date(marketSnapshotAt).toLocaleString()} <UiText value="· Live API data, not cached sync" /></p> : null}
              {marketLocalization ? (
                <div className="aca-column-stack" style={{ marginTop: 16 }}>
                  <div className="aca-stats-grid">
                    <MiniStat label={uiTranslate("Markets returned", language)} value={String(marketLocalization.marketCount)} />
                    <MiniStat label={uiTranslate("Markets with web presence", language)} value={String(marketLocalization.marketsWithWebPresence)} />
                    <MiniStat label={uiTranslate("Published Shopify locales", language)} value={String(marketLocalization.publishedLocaleCount)} />
                    <MiniStat label={uiTranslate("Jobs not attributable from web-presence locale data", language)} value={String(marketLocalization.jobsWithoutVerifiableMarketMapping)} />
                  </div>
                  {marketLocalization.marketsWithoutDedicatedWebPresence > 0 ? (
                    <InfoCallout tone="blue">{marketLocalization.marketsWithoutDedicatedWebPresence} <UiText value="market(s) have no dedicated web presence returned. Shopify may serve them on the primary domain via country selection. Country conditions below are not language coverage, and unmatched ACA jobs do not indicate missing translations." /></InfoCallout>
                  ) : null}
                  {marketLocalization.marketCount === 0 ? <EmptyState title={uiTranslate("No Markets returned", language)} text="Check Markets setup and API permissions in Shopify Admin." /> : (
                    <div className="aca-markets-table-wrap" role="region" aria-label={uiTranslate("Shopify Markets comparison", language)} tabIndex={0}>
                      <table className="aca-markets-table">
                        <thead><tr><th scope="col"><UiText value="Shopify Market" /></th><th scope="col"><UiText value="Status" /></th><th scope="col"><UiText value="Country conditions (Shopify)" /></th><th scope="col"><UiText value="Web presence locales" /></th><th scope="col"><UiText value="Published locales" /></th><th scope="col"><UiText value="Unpublished locales" /></th><th scope="col"><UiText value="ACA jobs (locale match only)" /></th><th scope="col"><UiText value="Shopify URLs" /></th></tr></thead>
                        <tbody>
                          {marketLocalization.rows.map(row => (
                            <tr key={row.id}>
                              <td className="aca-market-name"><strong>{row.name}</strong>{row.localization !== "CONFIGURED" ? <div className="aca-muted-small">{row.localization === "NO_WEB_PRESENCE" ? "No dedicated web presence; primary-domain country selector may apply" : "No locale returned by web presence"}</div> : null}</td>
                              <td><span className={`aca-market-status ${row.status === "ACTIVE" ? "aca-market-status--active" : ""}`}>{row.status}</span></td>
                              <td className="aca-market-countries">
                                {row.countryCodes.length > 12 ? (
                                  <details className="aca-market-country-details">
                                    <summary>{row.countryCodes.slice(0, 8).join(", ")} <span className="aca-market-country-more">+{row.countryCodes.length - 8} <UiText value="more · Show all" /></span></summary>
                                    <div className="aca-market-country-full">{row.countryCodes.join(", ")}{row.regionsTruncated ? " (partial: more regions)" : ""}</div>
                                  </details>
                                ) : row.countryCodes.length ? `${row.countryCodes.join(", ")}${row.regionsTruncated ? " (partial: more regions)" : ""}` : row.regionNames.length ? `${row.regionNames.slice(0, 8).join(", ")}${row.regionsTruncated ? " (partial: more regions)" : ""}` : "Not returned"}
                              </td>
                              <td>{row.locales.join(", ") || "Not available"}</td>
                              <td>{row.publishedLocales.join(", ") || "—"}</td>
                              <td>{row.unpublishedLocales.join(", ") || "—"}</td>
                              <td><strong className="aca-market-jobs-count">{row.jobCount}</strong> <UiText value="matching" /> <span className="aca-market-muted">· {row.completedJobCount} <UiText value="completed" /></span></td>
                              <td className="aca-market-urls">{row.rootUrls.length ? row.rootUrls.map(url => <div key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></div>) : "Not returned"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="aca-muted-small"><UiText value="Country conditions describe the market audience, not which translations are published. A market may have no dedicated web presence and still be available via the primary domain. Shopify Markets may share the same locale: job counts can overlap across markets. A completed job does not imply approved or published translations. To verify true localization coverage, use the Store Scan for each locale and inspect the storefront." /></p>
                  <h3 style={sectionHeadingStyle}><UiText value="Published languages from Shopify" /></h3>
                  {liveLocales?.length ? (
                    <div className="aca-market-locales-wrap" role="region" aria-label={uiTranslate("Shopify language publication status", language)} tabIndex={0}>
                      <table className="aca-market-locales-table">
                        <thead><tr><th scope="col"><UiText value="Locale" /></th><th scope="col"><UiText value="Name" /></th><th scope="col"><UiText value="Published" /></th><th scope="col"><UiText value="Primary" /></th></tr></thead>
                        <tbody>{liveLocales.map(item => (
                          <tr key={item.locale}>
                            <td><span className="aca-seo-locale">{item.locale}</span></td>
                            <td>{item.name || item.locale || "Unknown"}</td>
                            <td><span className={`aca-market-status ${item.published ? "aca-market-status--active" : "aca-market-status--inactive"}`}>{item.published ? "Published" : "Not published"}</span></td>
                            <td>{item.primary ? <span className="aca-market-primary-badge"><UiText value="Primary" /></span> : <span className="aca-market-muted">—</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <p className="aca-muted-small"><UiText value="No locales returned." /></p>}
                </div>
              ) : !marketsLoading && !marketsError ? <EmptyState title={uiTranslate("No live market snapshot", language)} text="Refresh Shopify Markets to inspect market locales without changing store configuration." /> : null}
            </Card>
          </div>
        ) : null}

        {activeTab === "ai-core" ? (
          <div className="aca-layout-two">
            <Card title={uiTranslate("ACA AI Core — Integration Readiness", language)} subtitle="Preview-only integration contract. ACA Locale continues using its current translation adapters.">
              <div className="aca-column-stack">
                <InfoCallout tone="blue"><UiText value="ACA AI Core is NOT connected. This view makes no network request to an AI Core gateway, does not invoke a model, and does not save routing changes. Translation, review and fallback remain on the existing ACA Locale backend." /></InfoCallout>
                <div className="aca-stat-grid-3">
                  <MiniStat label={uiTranslate("Core connection", language)} value="NOT CONNECTED" />
                  <MiniStat label={uiTranslate("Routing mode", language)} value="LOCAL ONLY" />
                  <MiniStat label={uiTranslate("Core executions", language)} value="DISABLED" />
                </div>
                <h3 style={{ color: ACA.blue }}><UiText value="Routing contract preview" /></h3>
                <table className="aca-pricing-table"><thead><tr><th><UiText value="Stage" /></th><th><UiText value="Role" /></th><th><UiText value="Provider" /></th><th><UiText value="Model" /></th></tr></thead><tbody>
                  {aiCoreReadiness.routes.map((route, idx) => <tr key={`${route.stage}:${route.role}:${idx}`}><td>{route.stage}</td><td>{route.role}</td><td>{route.provider}</td><td>{route.model || "Not required / unspecified"}</td></tr>)}
                </tbody></table>
                <p className="aca-muted-small"><UiText value="This is a deterministic preview of the current Settings form. Unsaved model choices may appear here; they do not change saved job configuration." /></p>
                <p className="aca-muted-small"><UiText value="The future gateway will require server-side authentication, tenant isolation, auditable usage and bounded failover before any traffic is redirected." /></p>
              </div>
            </Card>
            <Card title={uiTranslate("Readiness Checks & Contract", language)} subtitle="An exportable, credential-free draft for the future ACA AI Core integration.">
              <div className="aca-column-stack">
                <div className="aca-actions">
                  <button type="button" className="aca-mini-action" onClick={() => { setActiveTab("settings"); }}><UiText value="Open provider settings" /></button>
                  <button type="button" className="aca-mini-action" onClick={() => setActiveTab("usage")}><UiText value="Inspect AI usage" /></button>
                </div>
                {aiCoreReadiness.findings.length ? aiCoreReadiness.findings.map((finding, idx) => (
                  <InfoCallout key={`${finding.code}:${idx}`} tone={finding.level === "WARNING" ? "orange" : "blue"}>{finding.level}: {finding.detail}</InfoCallout>
                )) : <InfoCallout tone="blue"><UiText value="Configured routes have no detected issues in the available snapshots. This does not establish that ACA AI Core is connected or safe to enable." /></InfoCallout>}
                <Field label="Routing contract JSON — read-only (copy manually)">
                  <textarea aria-label="ACA AI Core preview contract JSON" readOnly rows={13} spellCheck={false} value={JSON.stringify(aiCoreReadiness.contract, null, 2)} style={{ ...inputStyle, width: "100%", fontFamily: "monospace" }} />
                </Field>
                <p className="aca-muted-small"><UiText value="No secrets, prompts or Shopify shop identifiers are included. There is no gateway endpoint or live connection in this release." /></p>
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "glossary" ? (
          <div className="aca-layout-glossary">
            <div className="aca-column-stack">
              <Card
                title={editingGlossaryEntryId ? "Edit Glossary Term" : "Add Glossary Term"}
                subtitle="Define protected terminology and preferred translations without hardcoding ACA-specific rules into the app."
              >
                <div className="aca-column-stack">
                  <Field label={uiTranslate("Source term", language)}>
                    <input
                      value={glossaryDraft.sourceTerm}
                      onChange={(event) =>
                        setGlossaryDraft((current) => ({
                          ...current,
                          sourceTerm: event.target.value,
                        }))
                      }
                      placeholder={uiTranslate("e.g. Vietri sul Mare", language)}
                      style={inputStyle}
                    />
                  </Field>

                  <div className="aca-form-grid-2">
                    <Field label={uiTranslate("Rule type", language)}>
                      <select
                        value={glossaryDraft.ruleType}
                        onChange={(event) =>
                          setGlossaryDraft((current) => ({
                            ...current,
                            ruleType: event.target.value as GlossaryRuleType,
                            targetTerm:
                              event.target.value === "DO_NOT_TRANSLATE"
                                ? ""
                                : current.targetTerm,
                          }))
                        }
                        style={inputStyle}
                      >
                        <option value="DO_NOT_TRANSLATE">{uiTranslate("Do not translate", language)}</option>
                        <option value="PREFERRED_TRANSLATION">{uiTranslate("Preferred translation", language)}</option>
                        <option value="FORBIDDEN_TRANSLATION">{uiTranslate("Forbidden translation", language)}</option>
                      </select>
                    </Field>

                    <Field label={uiTranslate("Target locale", language)}>
                      <input
                        value={glossaryDraft.targetLocale}
                        onChange={(event) =>
                          setGlossaryDraft((current) => ({
                            ...current,
                            targetLocale: event.target.value,
                          }))
                        }
                        placeholder="* / it / de / ja"
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <Field
                    label={
                      glossaryDraft.ruleType === "FORBIDDEN_TRANSLATION"
                        ? "Forbidden target term"
                        : "Target term"
                    }
                  >
                    <input
                      value={glossaryDraft.targetTerm}
                      disabled={glossaryDraft.ruleType === "DO_NOT_TRANSLATE"}
                      onChange={(event) =>
                        setGlossaryDraft((current) => ({
                          ...current,
                          targetTerm: event.target.value,
                        }))
                      }
                      placeholder={
                        glossaryDraft.ruleType === "DO_NOT_TRANSLATE"
                          ? "Not required"
                          : "Required for this rule"
                      }
                      style={{
                        ...inputStyle,
                        opacity: glossaryDraft.ruleType === "DO_NOT_TRANSLATE" ? 0.6 : 1,
                      }}
                    />
                  </Field>

                  <Field label={uiTranslate("Notes", language)}>
                    <textarea
                      value={glossaryDraft.notes}
                      onChange={(event) =>
                        setGlossaryDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
                      placeholder={uiTranslate("Brand, artisan terminology, cultural note…", language)}
                    />
                  </Field>

                  <div className="aca-glossary-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={glossaryDraft.caseSensitive}
                        onChange={(event) =>
                          setGlossaryDraft((current) => ({
                            ...current,
                            caseSensitive: event.target.checked,
                          }))
                        }
                      />
                      <UiText value="Case sensitive" />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={glossaryDraft.enabled}
                        onChange={(event) =>
                          setGlossaryDraft((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      <UiText value="Enabled" />
                    </label>
                  </div>

                  <div className="aca-actions">
                    <ActionButton
                      label={editingGlossaryEntryId ? "Save Changes" : "Add Term"}
                      actionKey="save-glossary-entry"
                      busyAction={busyAction}
                      onClick={saveGlossaryEntry}
                      primary
                    />
                    {editingGlossaryEntryId ? (
                      <button
                        type="button"
                        className="aca-action-button"
                        onClick={resetGlossaryForm}
                        style={{
                          border: `1px solid ${ACA.line}`,
                          background: ACA.white,
                          color: ACA.ink,
                        }}
                      >
                        <UiText value="Cancel" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </Card>

              <Card
                title={uiTranslate("CSV Import / Export", language)}
                subtitle="Share terminology with marketing or maintain larger glossaries in a spreadsheet."
              >
                <div className="aca-actions">
                  <label className="aca-file-button">
                    {busyAction === "import-glossary" ? "Importing…" : "Import CSV"}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={importGlossaryCsv}
                      disabled={Boolean(busyAction)}
                    />
                  </label>
                  <button
                    type="button"
                    className="aca-action-button"
                    onClick={exportGlossaryCsv}
                    disabled={!glossary || Boolean(busyAction)}
                    style={{
                      border: `1px solid ${ACA.line}`,
                      background: ACA.white,
                      color: ACA.ink,
                    }}
                  >
                    <UiText value="Export CSV" />
                  </button>
                </div>
                <div style={{ marginTop: 14 }}>
                  <InfoCallout tone="blue">
                    <UiText value="CSV columns: source_term, target_locale, target_term, rule_type, case_sensitive, enabled, notes. Use * for all target locales." />
                  </InfoCallout>
                </div>
              </Card>
            </div>

            <Card
              title={glossary?.name ?? "Master Glossary"}
              subtitle={
                glossary
                  ? `${glossary.entries.length} terminology rules · source ${glossary.sourceLocale}`
                  : "Shop-specific terminology rules."
              }
            >
              <div className="aca-filter-row">
                <input
                  value={glossarySearch}
                  onChange={(event) => setGlossarySearch(event.target.value)}
                  placeholder={uiTranslate("Search source term, translation, note…", language)}
                  style={inputStyle}
                />
                <select
                  value={glossaryLocaleFilter}
                  onChange={(event) => setGlossaryLocaleFilter(event.target.value)}
                  style={inputStyle}
                >
                  <option value="ALL">{uiTranslate("All locales", language)}</option>
                  {glossaryLocales.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale === "*" ? "* · All locales" : locale}
                    </option>
                  ))}
                </select>
              </div>

              <div className="aca-actions" style={{ marginBottom: 14 }}>
                <ActionButton
                  label={uiTranslate("Refresh", language)}
                  actionKey="refresh-glossary"
                  busyAction={busyAction}
                  onClick={() =>
                    void runAction(
                      "refresh-glossary",
                      loadGlossary,
                      "Glossary refreshed.",
                    )
                  }
                />
              </div>

              {loadingGlossary ? (
                <p style={mutedTextStyle}><UiText value="Loading glossary…" /></p>
              ) : glossaryError ? (
                <p style={{ ...mutedTextStyle, color: ACA.danger }}>{glossaryError}</p>
              ) : filteredGlossaryEntries.length === 0 ? (
                <EmptyState
                  title={uiTranslate("No glossary terms found", language)}
                  text="Add a protected term, preferred translation or forbidden translation."
                />
              ) : (
                <div className="aca-item-table-wrap">
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeadCellStyle}><UiText value="Source" /></th>
                        <th style={tableHeadCellStyle}><UiText value="Locale" /></th>
                        <th style={tableHeadCellStyle}><UiText value="Target / Forbidden" /></th>
                        <th style={tableHeadCellStyle}><UiText value="Rule" /></th>
                        <th style={tableHeadCellStyle}><UiText value="State" /></th>
                        <th style={tableHeadCellStyle}><UiText value="Actions" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGlossaryEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td style={tableBodyCellStyle}>
                            <strong>{entry.sourceTerm}</strong>
                            {entry.notes ? (
                              <div className="aca-muted-small">{entry.notes}</div>
                            ) : null}
                          </td>
                          <td style={tableBodyCellStyle}>
                            {entry.targetLocale === "*" ? "All" : entry.targetLocale}
                          </td>
                          <td style={tableBodyCellStyle}>
                            {entry.ruleType === "DO_NOT_TRANSLATE"
                              ? "Keep source unchanged"
                              : entry.targetTerm ?? "—"}
                          </td>
                          <td style={tableBodyCellStyle}>
                            <GlossaryRuleBadge rule={entry.ruleType} />
                            {entry.caseSensitive ? (
                              <div className="aca-muted-small"><UiText value="Case sensitive" /></div>
                            ) : null}
                          </td>
                          <td style={tableBodyCellStyle}>
                            <Pill
                              text={entry.enabled ? "Enabled" : "Disabled"}
                              tone={entry.enabled ? "green" : "orange"}
                            />
                          </td>
                          <td style={tableBodyCellStyle}>
                            <div className="aca-glossary-actions">
                              <button
                                type="button"
                                onClick={() => editGlossaryEntry(entry)}
                              >
                                <UiText value="Edit" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleGlossaryEntry(entry)}
                              >
                                {entry.enabled ? "Disable" : "Enable"}
                              </button>
                              <button
                                type="button"
                                className="aca-danger-link"
                                onClick={() => void deleteGlossaryEntry(entry)}
                              >
                                <UiText value="Delete" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "usage" ? (
          <Card
            title={uiTranslate("Usage & Cost Monitoring", language)}
            subtitle="30-day translation and AI review consumption."
          >
            <div className="aca-actions" style={{ marginBottom: 18 }}>
              <ActionButton
                label={uiTranslate("Refresh Usage", language)}
                actionKey="refresh-usage"
                busyAction={busyAction}
                onClick={() => void runAction("refresh-usage", loadUsage, "Usage refreshed.")}
              />
            </div>

            {loadingUsage ? (
              <p style={mutedTextStyle}><UiText value="Loading usage summary…" /></p>
            ) : usageError ? (
              <p style={{ ...mutedTextStyle, color: ACA.danger }}>{usageError}</p>
            ) : usageSummary ? (
              <>
                <div className="aca-stat-grid-4">
                  <MiniStat label={uiTranslate("Estimated cost (30 days)", language)} value={formatUsd(usageSummary.totals?.estimatedCostMicrousd)} />
                  <MiniStat label={uiTranslate("Billed characters", language)} value={(usageSummary.totals?.billedCharacters ?? 0).toLocaleString()} />
                  <MiniStat label={uiTranslate("LLM input tokens", language)} value={(usageSummary.totals?.inputTokens ?? 0).toLocaleString()} />
                  <MiniStat label={uiTranslate("LLM output tokens", language)} value={(usageSummary.totals?.outputTokens ?? 0).toLocaleString()} />
                </div>
                <div className="aca-stat-grid-4" style={{ marginTop: 10 }}>
                  <MiniStat label={uiTranslate("Provider calls", language)} value={String(usageSummary.totals?.events ?? 0)} />
                  <MiniStat label={uiTranslate("Successful", language)} value={String(usageSummary.totals?.successfulEvents ?? 0)} />
                  <MiniStat label={uiTranslate("Failed", language)} value={String(usageSummary.totals?.failedEvents ?? 0)} />
                  <MiniStat label="Unpriced calls" value={String(usageSummary.totals?.unpricedEvents ?? 0)} />
                </div>
                <h3 style={{ marginTop: 24, color: ACA.blue }}><UiText value="Usage by stage" /></h3>
                <div className="aca-item-table-wrap">
                  <table style={tableStyle}>
                    <thead><tr>
                      <th style={tableHeadCellStyle}><UiText value="Stage" /></th><th style={tableHeadCellStyle}><UiText value="Events" /></th>
                      <th style={tableHeadCellStyle}><UiText value="Characters" /></th><th style={tableHeadCellStyle}><UiText value="Input tokens" /></th>
                      <th style={tableHeadCellStyle}><UiText value="Output tokens" /></th><th style={tableHeadCellStyle}><UiText value="Estimated cost" /></th>
                    </tr></thead>
                    <tbody>{(usageSummary.byStage ?? []).map((row) => (
                      <tr key={row.stage}>
                        <td style={tableBodyCellStyle}>{row.stage}</td>
                        <td style={tableBodyCellStyle}>{row.events}</td>
                        <td style={tableBodyCellStyle}>{row.billedCharacters.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{row.inputTokens.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{row.outputTokens.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{formatUsd(row.estimatedCostMicrousd)}{row.unpricedEvents > 0 ? ` · ${row.unpricedEvents} unpriced` : ""}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <h3 style={{ marginTop: 24, color: ACA.blue }}><UiText value="Usage by provider and model" /></h3>
                <div className="aca-item-table-wrap">
                  <table style={tableStyle}>
                    <thead><tr>
                      <th style={tableHeadCellStyle}><UiText value="Provider" /></th><th style={tableHeadCellStyle}><UiText value="Model" /></th>
                      <th style={tableHeadCellStyle}><UiText value="Events" /></th><th style={tableHeadCellStyle}><UiText value="Characters" /></th>
                      <th style={tableHeadCellStyle}><UiText value="Input tokens" /></th><th style={tableHeadCellStyle}><UiText value="Output tokens" /></th>
                      <th style={tableHeadCellStyle}><UiText value="Estimated cost" /></th>
                    </tr></thead>
                    <tbody>{(usageSummary.byProvider ?? []).map((row) => (
                      <tr key={`${row.provider}-${row.model ?? "none"}`}>
                        <td style={tableBodyCellStyle}>{row.provider}</td>
                        <td style={tableBodyCellStyle}>{row.model ?? "—"}</td>
                        <td style={tableBodyCellStyle}>{row.events}</td>
                        <td style={tableBodyCellStyle}>{row.billedCharacters.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{row.inputTokens.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{row.outputTokens.toLocaleString()}</td>
                        <td style={tableBodyCellStyle}>{formatUsd(row.estimatedCostMicrousd)}{row.unpricedEvents > 0 ? " · incomplete" : ""}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <InfoCallout tone={usageHasUnpricedCosts(usageSummary.totals) ? "orange" : "blue"} style={{ marginTop: 18 }}>
                  {usageHasUnpricedCosts(usageSummary.totals)
                    ? `${usageSummary.totals.unpricedEvents} usage events have no configured price. The displayed total is incomplete; configure versioned Usage Pricing in Settings. Historical unpriced events remain unchanged.`
                    : "Costs are estimates based on the pricing version saved with each usage event, not provider invoices. Tiny amounts use up to six decimals."}
                </InfoCallout>
              </>
            ) : (
              <EmptyState title={uiTranslate("No usage data", language)} text="Usage events appear after translations or AI reviews are executed." />
            )}
          </Card>
        ) : null}

        {activeTab === "settings" ? (
          <div className="aca-layout-two">
            <Card title={uiTranslate("Usage Pricing (USD)", language)} subtitle="Versioned rates per 1,000,000 billable units; applies only to future provider events.">
              <div className="aca-column-stack">
                <p className="aca-muted-small"><UiText value="Source:" /> {pricingSource} <UiText value="· Version" /> {pricingVersion}<UiText value=". Enter the contractual USD rates for your own providers. No prices are imported automatically." /></p>
                <div className="aca-actions">
                  <button type="button" className="aca-mini-action" onClick={switchPricingEditor}>
                    {pricingAdvanced ? "Use guided editor" : "Advanced: edit JSON"}
                  </button>
                  {!pricingAdvanced ? <button type="button" className="aca-mini-action" onClick={() => { setPricingRows((current) => [...current, { provider: "DEEPL", model: "*", charactersPerMillionUsd: "", inputPerMillionUsd: "", outputPerMillionUsd: "" }]); setPricingDirty(true); setPricingPreview(null); }}><UiText value="+ Add provider / model" /></button> : null}
                </div>
                {pricingAdvanced ? (
                  <Field label="Pricing JSON: PROVIDER:model or PROVIDER:*">
                    <textarea aria-label="Versioned usage pricing JSON" value={pricingRulesText}
                      onChange={(event) => { setPricingRulesText(event.target.value); setPricingDirty(true); setPricingPreview(null); }}
                      rows={11} spellCheck={false} style={{ ...inputStyle, fontFamily: "monospace", width: "100%" }} />
                  </Field>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="aca-pricing-table">
                      <thead><tr><th><UiText value="Provider" /></th><th><UiText value="Model (* = all)" /></th><th><UiText value="Characters / 1M" /></th><th><UiText value="Input tokens / 1M" /></th><th><UiText value="Output tokens / 1M" /></th><th><UiText value="Action" /></th></tr></thead>
                      <tbody>
                        {pricingRows.map((row, index) => (
                          <tr key={index}>
                            <td><select aria-label={`Pricing provider ${index + 1}`} value={row.provider} onChange={(event) => editPricingRow(index, { provider: event.target.value })} style={inputStyle}>
                              {Array.from(new Set(["DEEPL", "OPENAI", "ANTHROPIC", "GOOGLE", "MISTRAL", row.provider])).map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                            </select></td>
                            <td><input aria-label={`Pricing model ${index + 1}`} value={row.model} onChange={(event) => editPricingRow(index, { model: event.target.value })} style={inputStyle} placeholder="* or exact model" /></td>
                            {(["charactersPerMillionUsd", "inputPerMillionUsd", "outputPerMillionUsd"] as const).map((key) => (
                              <td key={key}><input aria-label={`${key} row ${index + 1}`} type="number" min="0" max="100000" step="any" value={row[key]}
                                onChange={(event) => editPricingRow(index, { [key]: event.target.value })} style={{ ...inputStyle, minWidth: 100 }} placeholder="—" /></td>
                            ))}
                            <td><button type="button" className="aca-mini-action" aria-label={`Remove pricing row ${index + 1}`} onClick={() => { setPricingRows((current) => current.filter((_, i) => i !== index)); setPricingDirty(true); setPricingPreview(null); }}><UiText value="Remove" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!pricingRows.length ? <p className="aca-muted-small"><UiText value="No rates configured. Add a provider and model to start. Empty rate fields are not charged at zero." /></p> : null}
                  </div>
                )}
                <p className="aca-muted-small"><UiText value="Use * only when the same price applies to all models of a provider. Blank fields mean that rate is not configured. A numerical 0 is an explicit zero-dollar rate." /></p>
                {pricingError ? <p role="alert" style={{ color: ACA.danger }}>{pricingError}</p> : null}
                <div className="aca-actions">
                  <ActionButton label="Preview historical usage (no save)" actionKey="preview-usage-pricing" busyAction={busyAction} onClick={() => void previewPricing()} />
                  <ActionButton label="Save new pricing version" actionKey="save-usage-pricing" busyAction={busyAction} onClick={() => void savePricing()} />
                  <button className="aca-mini-action" type="button" onClick={() => void loadPricing()}><UiText value="Discard edits / Refresh" /></button>
                  {pricingDirty ? <span className="aca-muted-small"><UiText value="Unsaved changes" /></span> : null}
                </div>
                {pricingPreview ? (
                  <div role="status" style={{ border: `1px solid ${ACA.line}`, padding: 12, borderRadius: 8 }}>
                    <strong><UiText value="30-day cost simulation — not saved" /></strong>
                    <p className="aca-muted-small"><UiText value="Previewed" /> {pricingPreview.sampledEvents} <UiText value="of" /> {pricingPreview.totalEvents} <UiText value="events. Priced:" /> {pricingPreview.costedEvents}<UiText value="; unpriced:" /> {pricingPreview.unpricedEvents}<UiText value="; usage unknown:" /> {pricingPreview.unknownUsageEvents}.</p>
                    <p style={{ fontWeight: 700 }}><UiText value="Simulated USD $" />{pricingPreview.estimatedCostUsd.toFixed(6)} {pricingPreview.complete ? "(complete for observed events)" : "(INCOMPLETE — not an invoice)"}</p>
                    <h4 style={{ marginTop: 12, color: ACA.blue }}><UiText value="Cost intelligence — simulated rates only" /></h4>
                    <div className="aca-actions">
                      <span className="aca-muted-small"><UiText value="Priced coverage:" /> {pricingPreview.costCoveragePercent?.toFixed(2) ?? "—"}<UiText value="% of recorded events" /></span>
                      <span className="aca-muted-small"><UiText value="30-day cost lower bound: $" />{pricingPreview.lowerBound30DayUsd?.toFixed(6) ?? pricingPreview.estimatedCostUsd.toFixed(6)}</span>
                    </div>
                    <p className="aca-muted-small">{pricingPreview.projected30DayUsd === null || pricingPreview.projected30DayUsd === undefined
                      ? "Forecast unavailable: some events have missing prices, unknown usage or truncated history. The known amount is only a lower bound."
                      : `Observed 30-day run-rate: $${pricingPreview.projected30DayUsd.toFixed(6)}; illustrative current-month run-rate: $${pricingPreview.projectedMonthUsd?.toFixed(6) ?? "—"}. Assumes the last 30 days repeat daily; not an invoice forecast.`}</p>
                    {aiBudget?.monthlyBudgetUsd ? (
                      <p className="aca-muted-small"><UiText value="Simulated share of the $" />{aiBudget.monthlyBudgetUsd.toFixed(2)} <UiText value="USD advisory monthly budget:" /> {(pricingPreview.estimatedCostUsd / aiBudget.monthlyBudgetUsd * 100).toFixed(2)}% {pricingPreview.complete ? "(observed 30-day comparison)" : "(minimum only — incomplete)"}<UiText value=". This does not change budget alerts." /></p>
                    ) : null}
                    {(pricingPreview.missingRateKeys?.length ?? 0) > 0 ? (
                      <div><strong><UiText value="Missing pricing entries" /></strong><p className="aca-muted-small"><UiText value="Configure contractual rates for these observed provider/model pairs. No automatic prices are imported." /></p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{pricingPreview.missingRateKeys?.map((key) => <span key={key} style={{ border: `1px solid ${ACA.line}`, borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>{key}</span>)}</div>
                        {pricingPreview.missingRateKeysTruncated ? <p className="aca-muted-small"><UiText value="Additional missing keys are not shown." /></p> : null}
                      </div>
                    ) : null}
                    {(pricingPreview.byProviderModel?.length ?? 0) > 0 ? (
                      <div style={{ overflowX: "auto", marginTop: 12 }}><table className="aca-pricing-table"><thead><tr><th><UiText value="Provider" /></th><th><UiText value="Model" /></th><th><UiText value="Stage" /></th><th><UiText value="Events" /></th><th><UiText value="Priced" /></th><th><UiText value="Unpriced" /></th><th><UiText value="Unknown usage" /></th><th><UiText value="Known USD" /></th></tr></thead>
                        <tbody>{pricingPreview.byProviderModel?.map((g, index) => <tr key={`${g.provider}:${g.model}:${g.stage}:${index}`}><td>{g.provider}</td><td>{g.model ?? "—"}</td><td>{g.stage}</td><td>{g.events}</td><td>{g.priced}</td><td>{g.unpriced}</td><td>{g.unknownUsage}</td><td>${g.estimatedCostUsd.toFixed(6)}</td></tr>)}</tbody></table>
                        {pricingPreview.groupsTruncated ? <p role="alert"><UiText value="Only the first 50 provider/model groups are displayed." /></p> : null}
                      </div>
                    ) : null}
                    {pricingPreview.truncated ? <p role="alert"><UiText value="More than 10,000 events in the period: this preview covers only the most recent 10,000." /></p> : null}
                    <p className="aca-muted-small"><UiText value="These rates are only simulated against recorded usage. Historical event costs and provider invoices are unchanged." /></p>
                  </div>
                ) : null}
                <p className="aca-muted-small"><UiText value="Historical cost snapshots remain unchanged. Recent revisions:" /> {pricingHistory.length ? pricingHistory.map((h) => `v${h.version}`).join(", ") : "none"}.</p>
              </div>
            </Card>
            <Card title={uiTranslate("AI Budget & Reliability", language)} subtitle="Monthly UTC advisory budget and observed provider failures. No automatic restrictions on jobs.">
              <div className="aca-column-stack">
                <p className="aca-muted-small"><UiText value="Budget month:" /> {aiBudget?.month ?? "loading"} <UiText value="(UTC) · Version" /> {aiBudget?.version ?? 0}<UiText value=". USD. Enter 0 to disable budget alerts." /></p>
                <div className="aca-actions" style={{ alignItems: "end" }}>
                  <Field label={uiTranslate("Monthly AI budget (USD)", language)}>
                    <input aria-label={uiTranslate("Monthly AI advisory budget USD", language)} type="number" min="0" max="1000000" step="0.01" value={aiBudgetInput}
                      onChange={(event) => setAiBudgetInput(event.target.value)} style={{ ...inputStyle, maxWidth: 220 }} />
                  </Field>
                  <ActionButton label={uiTranslate("Save budget", language)} actionKey="save-ai-budget" busyAction={busyAction} onClick={() => void saveAiBudget()} />
                  <button type="button" className="aca-mini-action" onClick={() => void loadAiBudget()}><UiText value="Refresh" /></button>
                </div>
                {aiBudgetError ? <p role="alert" style={{ color: ACA.danger }}>{aiBudgetError}</p> : null}
                {aiBudget ? <>
                  <div className="aca-stat-grid-3">
                    <MiniStat label={uiTranslate("Known estimated USD", language)} value={`$${aiBudget.estimatedCostUsd.toFixed(6)}`} />
                    <MiniStat label={uiTranslate("Budget used (minimum)", language)} value={aiBudget.percentOfBudget === null ? "Not configured" : `${aiBudget.percentOfBudget}%`} />
                    <MiniStat label={uiTranslate("Provider failures", language)} value={String(aiBudget.failedEvents)} />
                  </div>
                  {aiBudget.threshold !== "NOT_CONFIGURED" && aiBudget.threshold !== "BELOW_50" ? (
                    <InfoCallout tone="orange"><UiText value="Budget threshold reached:" /> {aiBudget.threshold === "OVER_100" ? "100%+" : aiBudget.threshold === "OVER_80" ? "80%+" : "50%+"} <UiText value="of the monthly limit based on known estimated costs." /></InfoCallout>
                  ) : null}
                  {aiBudget.incomplete ? <InfoCallout tone="orange"><UiText value="Incomplete cost coverage:" /> {aiBudget.unpricedEvents} <UiText value="unpriced events," /> {aiBudget.unknownUsageEvents} <UiText value="unknown-usage events" />{aiBudget.truncated ? ", and more than 10,000 events" : ""}<UiText value=". Total spend may be higher than shown; do not treat the percentage as final." /></InfoCallout> : null}
                  <p className="aca-muted-small">{aiBudget.totalEvents} <UiText value="calls this month. Notifications are derived from recorded usage on every refresh; no email alerts and no automatic blocking." /></p>
                  <strong><UiText value="Operational alerts (current UTC month)" /></strong>
                  {(aiBudget.alerts ?? []).length ? (aiBudget.alerts ?? []).map((alert) => (
                    <div key={alert.code} role="status" style={{ border: "1px solid #e4d8b9", borderRadius: 8, padding: 10, marginBottom: 6 }}>
                      <strong>{alert.severity}: {alert.title}</strong>
                      <p className="aca-muted-small">{alert.detail}</p>
                    </div>
                  )) : <p className="aca-muted-small"><UiText value="No active operational alerts." /></p>}
                  <div className="aca-stat-grid-3">
                    <MiniStat label={uiTranslate("Recorded fallback events", language)} value={String(aiBudget.fallbackEvents ?? 0)} />
                    <MiniStat label={uiTranslate("Recent failures available", language)} value={String(aiBudget.recentFailures?.length ?? 0)} />
                    <MiniStat label={uiTranslate("Alerts delivery", language)} value="In-app only" />
                  </div>
                  <strong><UiText value="Recent provider errors (up to 30, current UTC month)" /></strong>
                  <p className="aca-muted-small"><UiText value="Error categories are classified server-side. Raw exception messages, prompts and credentials are never exposed in this table. Existing fallback policy remains unchanged." /></p>
                  <div style={{ overflowX: "auto" }}>
                    <table className="aca-pricing-table"><thead><tr><th><UiText value="Time (UTC)" /></th><th><UiText value="Provider" /></th><th><UiText value="Model" /></th><th><UiText value="Stage" /></th><th><UiText value="Category" /></th><th><UiText value="Fallback" /></th></tr></thead><tbody>
                      {(aiBudget.recentFailures ?? []).map((entry) => <tr key={entry.id}>
                        <td>{new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })}</td>
                        <td>{entry.provider}</td><td>{entry.model ?? "(none)"}</td><td>{entry.stage}</td><td>{entry.category}</td><td>{entry.fallback ? "Yes" : "No"}</td>
                      </tr>)}
                    </tbody></table>
                    {!aiBudget.recentFailures?.length ? <p className="aca-muted-small"><UiText value="No recorded provider failures this month." /></p> : null}
                    {aiBudget.failureHistoryTruncated ? <p className="aca-muted-small"><UiText value="Showing the latest 30 failed events." /></p> : null}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="aca-pricing-table"><thead><tr><th><UiText value="Provider" /></th><th><UiText value="Calls" /></th><th><UiText value="Failures" /></th><th><UiText value="Unpriced" /></th><th><UiText value="Known USD" /></th></tr></thead>
                      <tbody>{aiBudget.byProvider.map((entry) => <tr key={entry.provider}>
                        <td>{entry.provider}</td><td>{entry.events}</td><td>{entry.failed}</td><td>{entry.unpriced}</td><td>${entry.estimatedCostUsd.toFixed(6)}</td>
                      </tr>)}</tbody>
                    </table>
                    {!aiBudget.byProvider.length ? <p className="aca-muted-small"><UiText value="No recorded events this month." /></p> : null}
                  </div>
                  <strong><UiText value="Model reliability (up to 30 models)" /></strong>
                  <div style={{ overflowX: "auto" }}>
                    <table className="aca-pricing-table"><thead><tr><th><UiText value="Provider" /></th><th><UiText value="Model" /></th><th><UiText value="Calls" /></th><th><UiText value="Failures" /></th><th><UiText value="Known USD" /></th></tr></thead><tbody>
                      {aiBudget.byModel.map((entry) => <tr key={`${entry.provider}:${entry.model}`}><td>{entry.provider}</td><td>{entry.model}</td><td>{entry.events}</td><td>{entry.failed}</td><td>${entry.estimatedCostUsd.toFixed(6)}</td></tr>)}
                    </tbody></table>
                  </div>
                </> : <p className="aca-muted-small"><UiText value="Budget status not loaded." /></p>}
              </div>
            </Card>
            <Card
              title={uiTranslate("AI Provider Management", language)}
              subtitle="Manual credential checks and live model discovery; no AI generations or configuration changes."
            >
              <div className="aca-column-stack">
                <div className="aca-actions">
                  <ActionButton label={uiTranslate("Check provider connections", language)} actionKey="ai-provider-health" busyAction={busyAction} onClick={() => void checkAiProviderConnections()} />
                  <ActionButton label={uiTranslate("Load model catalog", language)} actionKey="ai-model-catalog" busyAction={busyAction} onClick={() => void browseAiModels()} />
                </div>
                <p className="aca-muted-small"><UiText value="Checks contact provider metadata/usage endpoints and may make API requests, but do not generate billable text. Connection success does not guarantee model-specific access or remaining quota. API keys remain on the backend." /></p>
                {aiProviderHealthError ? <InfoCallout tone="orange"><UiText value="Provider check failed:" /> {aiProviderHealthError}</InfoCallout> : null}
                {aiProviderHealth ? (
                  <div>
                    <p className="aca-muted-small"><UiText value="Last checked:" /> {aiProviderHealthCheckedAt ? new Date(aiProviderHealthCheckedAt).toLocaleString() : "—"} <UiText value="(manual snapshot)" /></p>
                    <div className="aca-table-wrap">
                      <table className="aca-table">
                        <thead><tr><th><UiText value="Provider" /></th><th><UiText value="Connection" /></th><th><UiText value="Latency" /></th><th><UiText value="Details" /></th></tr></thead>
                        <tbody>{aiProviderHealth.map((provider) => (
                          <tr key={provider.provider}>
                            <td>{provider.provider.toUpperCase()}</td>
                            <td>{provider.status}</td>
                            <td>{provider.latencyMs === null ? "—" : `${provider.latencyMs} ms`}</td>
                            <td>{provider.status === "OK"
                              ? provider.usage
                                ? `${provider.usage.characterCount.toLocaleString()} / ${provider.usage.characterLimit.toLocaleString()} DeepL characters`
                                : "Credentials accepted"
                              : provider.status === "NOT_CONFIGURED" ? "No server-side key" : "Connection check failed (see server logs)"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {aiModelCatalogError ? <InfoCallout tone="orange"><UiText value="Model catalog unavailable:" /> {aiModelCatalogError}</InfoCallout> : null}
                {aiModelCatalog ? (
                  <div className="aca-column-stack">
                    <p className="aca-muted-small"><UiText value="Catalog generated" /> {new Date(aiModelCatalog.generatedAt).toLocaleString()}<UiText value=". Provider catalog is cached for up to five minutes. Only models marked selectable can be chosen." /></p>
                    <div className="aca-actions">
                      <select aria-label={uiTranslate("Filter AI model provider", language)} style={{ ...inputStyle, maxWidth: 180 }} value={aiCatalogProviderFilter} onChange={(event) => setAiCatalogProviderFilter(event.target.value)}>
                        <option value="ALL">{uiTranslate("All providers", language)}</option>
                        {aiModelCatalog.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.provider.toUpperCase()}</option>)}
                      </select>
                      <input aria-label={uiTranslate("Search AI models", language)} placeholder={uiTranslate("Search model ID or name", language)} style={{ ...inputStyle, maxWidth: 270 }} value={aiCatalogSearch} onChange={(event) => setAiCatalogSearch(event.target.value)} />
                    </div>
                    {aiModelCatalog.providers.filter((provider) => aiCatalogProviderFilter === "ALL" || provider.provider === aiCatalogProviderFilter).map((provider) => {
                      const models = provider.models.filter((model) => model.selectable && `${model.id} ${model.name}`.toLowerCase().includes(aiCatalogSearch.trim().toLowerCase()));
                      return (
                        <div key={provider.provider} style={{ border: `1px solid ${ACA.line}`, borderRadius: 8, padding: 10 }}>
                          <strong>{provider.provider.toUpperCase()} · {provider.status} · {provider.modelCount} <UiText value="reported" /></strong>
                          {provider.status !== "OK" ? <p className="aca-muted-small"><UiText value="Catalog not available for this provider." /></p> : null}
                          {provider.provider === "deepl" ? <p className="aca-muted-small"><UiText value="DeepL requires no model ID." /></p> : null}
                          {models.length === 0 && provider.requiresModel && provider.status === "OK" ? <p className="aca-muted-small"><UiText value="No selectable models match the filter." /></p> : null}
                          {models.slice(0, 25).map((model) => (
                            <div key={model.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${ACA.line}` }}>
                              <div style={{ flex: "1 1 190px", minWidth: 0 }}><strong>{model.name}</strong><div className="aca-muted-small">{model.id}</div></div>
                              <button type="button" className="aca-mini-action" onClick={() => chooseAiCatalogModel(provider.provider, model.id, "translation")}><UiText value="Use for translation" /></button>
                              <button type="button" className="aca-mini-action" onClick={() => chooseAiCatalogModel(provider.provider, model.id, "fallback")}><UiText value="Use as fallback" /></button>
                              <button type="button" className="aca-mini-action" onClick={() => chooseAiCatalogModel(provider.provider, model.id, "review")}><UiText value="Use for review" /></button>
                            </div>
                          ))}
                          {models.length > 25 ? <p className="aca-muted-small"><UiText value="Showing the first 25 matches. Narrow the search to see more." /></p> : null}
                        </div>
                      );
                    })}
                    <InfoCallout tone="blue"><UiText value="Selecting a model only fills the Translation Engine or AI Review form. Press Save Configuration separately to update future jobs. Existing jobs are not changed." /></InfoCallout>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card
              title={uiTranslate("Translation Engine", language)}
              subtitle="Choose the primary translation provider and fallback used for future jobs."
            >
              <div className="aca-form-grid-2">
                <Field label={uiTranslate("Translation provider", language)}>
                  <select
                    value={aiConfiguration.translationProvider}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        translationProvider: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="DEEPL">DeepL</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="ANTHROPIC">Anthropic</option>
                    <option value="GOOGLE">Google</option>
                  </select>
                </Field>
                <Field label={uiTranslate("Translation model", language)}>
                  <input
                    value={aiConfiguration.translationModel}
                    disabled={aiConfiguration.translationProvider === "DEEPL"}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        translationModel: event.target.value,
                      }))
                    }
                    placeholder={aiConfiguration.translationProvider === "DEEPL" ? "Not required for DeepL" : "provider:model or model id"}
                    style={{ ...inputStyle, opacity: aiConfiguration.translationProvider === "DEEPL" ? 0.6 : 1 }}
                  />
                </Field>
                <Field label={uiTranslate("Fallback provider", language)}>
                  <select
                    value={aiConfiguration.fallbackProvider}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        fallbackProvider: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="">{uiTranslate("No fallback", language)}</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="ANTHROPIC">Anthropic</option>
                    <option value="GOOGLE">Google</option>
                    <option value="DEEPL">DeepL</option>
                  </select>
                </Field>
                <Field label={uiTranslate("Fallback model", language)}>
                  <input
                    value={aiConfiguration.fallbackModel}
                    disabled={!aiConfiguration.fallbackProvider || aiConfiguration.fallbackProvider === "DEEPL"}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        fallbackModel: event.target.value,
                      }))
                    }
                    style={{ ...inputStyle, opacity: !aiConfiguration.fallbackProvider || aiConfiguration.fallbackProvider === "DEEPL" ? 0.6 : 1 }}
                  />
                </Field>
              </div>
            </Card>

            <Card
              title={uiTranslate("AI Review", language)}
              subtitle="Configure the quality reviewer snapshotted when new jobs are created."
            >
              <div className="aca-form-grid-2">
                <Field label={uiTranslate("Review provider", language)}>
                  <select
                    value={aiConfiguration.reviewProvider}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        reviewProvider: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="ANTHROPIC">Anthropic</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="GOOGLE">Google</option>
                  </select>
                </Field>
                <Field label={uiTranslate("Review model", language)}>
                  <input
                    value={aiConfiguration.reviewModel}
                    onChange={(event) =>
                      setAiConfiguration((current) => ({
                        ...current,
                        reviewModel: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div className="aca-actions" style={{ marginTop: 18 }}>
                <ActionButton
                  label={uiTranslate("Save Configuration", language)}
                  actionKey="save-ai-config"
                  busyAction={busyAction}
                  onClick={saveAiConfiguration}
                  primary
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <InfoCallout tone="blue">
                  <UiText value="Configuration changes affect only new jobs. Existing jobs keep their snapshotted provider and model history." />
                </InfoCallout>
              </div>
              <div style={{ marginTop: 18 }}>
                <h3 style={{ color: ACA.blue }}><UiText value="AI usage & pricing status" /></h3>
                <div className="aca-stat-grid-3">
                  <MiniStat label={uiTranslate("Recorded calls (30d)", language)} value={String(usageSummary?.totals?.events ?? 0)} />
                  <MiniStat label="Unpriced calls" value={String(usageSummary?.totals?.unpricedEvents ?? 0)} />
                  <MiniStat label={uiTranslate("Estimated spend", language)} value={formatUsd(usageSummary?.totals?.estimatedCostMicrousd)} />
                </div>
                <p style={{ ...mutedTextStyle, marginTop: 10 }}>
                  <UiText value="Provider credentials are managed securely on the backend. Edit versioned usage prices in Settings → Usage Pricing. Historical unpriced events remain unchanged." />
                </p>
                <button type="button" className="aca-mini-action" onClick={() => setActiveTab("usage")}><UiText value="Inspect usage by provider" /></button>
              </div>
            </Card>
          </div>
        ) : null}
      </main>

      <div className="aca-debug-toggle-wrap">
        <button
          type="button"
          className="aca-debug-toggle"
          onClick={() => setShowDebug((value) => !value)}
        >
          {uiTranslate(showDebug ? "Hide developer response" : "Show developer response", language)}
        </button>
      </div>

      {showDebug ? (
        <div className="aca-debug-panel">
          <pre style={debugStyle}>
            {lastResult
              ? JSON.stringify(lastResult, null, 2)
              : uiTranslate("No request executed yet.", language)}
          </pre>
        </div>
      ) : null}
    </div>
    </UiLanguageContext.Provider>
  );
}

function OverviewTab({
  jobs,
  reviewQueue,
  usageSummary,
  loadingUsage,
  usageError,
  formatUsd,
  formatDateTime,
  statusBadge,
  onGoToJobs,
  onGoToReview,
  onGoToScanner,
  onSelectJob,
  onSelectReview,
}: {
  jobs: TranslationJob[];
  reviewQueue: Array<{ job: TranslationJob; item: JobItem }>;
  usageSummary: UsageSummary | null;
  loadingUsage: boolean;
  usageError: string | null;
  formatUsd: (value?: number) => string;
  formatDateTime: (value?: string | null) => string;
  statusBadge: (status?: string) => ReactNode;
  onGoToJobs: () => void;
  onGoToReview: () => void;
  onGoToScanner: () => void;
  onSelectJob: (jobId: string) => void;
  onSelectReview: (jobId: string, itemId: string) => void;
}) {
  const language = useContext(UiLanguageContext);
  const active = jobs.filter(
    (job) => job.status === "QUEUED" || job.status === "RUNNING",
  );

  return (
    <div className="aca-overview-grid">
      <div className="aca-column-stack">
        <Card title={uiTranslate("Quick Actions", language)} subtitle={uiTranslate("Start from the most common operational tasks.", language)}>
          <div className="aca-quick-grid">
            <QuickAction title={uiTranslate("Scan Store", language)} text="Refresh Shopify translation state before creating jobs." color={ACA.green} onClick={onGoToScanner} />
            <QuickAction title={uiTranslate("Create / Manage Jobs", language)} text="Translate missing or outdated fields in the background." color={ACA.blue} onClick={onGoToJobs} />
            <QuickAction title={uiTranslate("Review Queue", language)} text={`${reviewQueue.length} ${uiTranslate("items currently waiting for a decision.", language)}`} color={ACA.orange} onClick={onGoToReview} />
          </div>
        </Card>

        <Card title={uiTranslate("Recent Jobs", language)} subtitle={uiTranslate("Latest translation activity.", language)}>
          {jobs.length === 0 ? (
            <EmptyState title={uiTranslate("No jobs yet", language)} text={uiTranslate("Scan Shopify and create your first translation job.", language)} />
          ) : (
            <div className="aca-overview-job-list">
              {jobs.slice(0, 6).map((job) => (
                <button key={job.id} type="button" className="aca-overview-job" onClick={() => onSelectJob(job.id)}>
                  <div>
                    <strong>{job.sourceLocale} → {job.targetLocale}</strong>
                    <div className="aca-muted-small">{job.provider ?? "—"} · {formatDateTime(job.createdAt)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {statusBadge(job.status)}
                    <div className="aca-muted-small" style={{ marginTop: 6 }}>{job.completedItems}/{job.totalItems}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="aca-column-stack">
        <Card title={uiTranslate("Operations", language)} subtitle={uiTranslate("Current queue and review workload.", language)}>
          <div className="aca-stat-grid-3">
            <MiniStat label={uiTranslate("Active jobs", language)} value={String(active.length)} />
            <MiniStat label={uiTranslate("Review items", language)} value={String(reviewQueue.length)} />
            <MiniStat label={uiTranslate("Recent jobs", language)} value={String(jobs.length)} />
          </div>

          {reviewQueue.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <h3 style={sectionHeadingStyle}><UiText value="Needs attention" /></h3>
              <div className="aca-review-list">
                {reviewQueue.slice(0, 4).map(({ job, item }) => (
                  <button key={item.id} type="button" className="aca-review-row" onClick={() => onSelectReview(job.id, item.id)}>
                    <div>
                      <strong>{item.field?.key ?? "Translation"}</strong>
                      <div className="aca-muted-small">{job.sourceLocale} → {job.targetLocale}</div>
                    </div>
                    <div>{statusBadge(item.status)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card title={uiTranslate("30-day Usage", language)} subtitle={uiTranslate("Provider consumption and estimated spend.", language)}>
          {loadingUsage ? (
            <p style={mutedTextStyle}><UiText value="Loading usage…" /></p>
          ) : usageError ? (
            <p style={{ ...mutedTextStyle, color: ACA.danger }}>{usageError}</p>
          ) : usageSummary ? (
            <>
            <div className="aca-stat-grid-3">
              <MiniStat label={uiTranslate("Estimated cost", language)} value={formatUsd(usageSummary.totals?.estimatedCostMicrousd)} />
              <MiniStat label={uiTranslate("Characters", language)} value={String(usageSummary.totals?.billedCharacters ?? 0)} />
              <MiniStat label={uiTranslate("LLM tokens", language)} value={String((usageSummary.totals?.inputTokens ?? 0) + (usageSummary.totals?.outputTokens ?? 0))} />
            </div>
            {usageHasUnpricedCosts(usageSummary.totals) ? (
              <p className="aca-muted-small" style={{ marginTop: 10, color: ACA.warning }}>
                <UiText value="Cost estimate is incomplete:" /> {usageSummary.totals.unpricedEvents} <UiText value="unpriced events. Open Usage for details." />
              </p>
            ) : null}
            </>
          ) : (
            <EmptyState title={uiTranslate("No usage data", language)} text={uiTranslate("Usage appears after translation or AI review calls.", language)} />
          )}
        </Card>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="aca-header-stat" style={{ borderTopColor: color }}>
      <div className="aca-header-stat-label"><UiText value={label} /></div>
      <div className="aca-header-stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function QuickAction({ title, text, color, onClick }: { title: string; text: string; color: string; onClick: () => void }) {
  return (
    <button type="button" className="aca-quick-action" onClick={onClick} style={{ borderTopColor: color }}>
      <strong><UiText value={title} /></strong>
      <span><UiText value={text} /></span>
    </button>
  );
}

function JobListItem({
  job,
  selected,
  statusBadge,
  formatDateTime,
  onClick,
}: {
  job: TranslationJob;
  selected: boolean;
  statusBadge: (status?: string) => ReactNode;
  formatDateTime: (value?: string | null) => string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`aca-job-row ${selected ? "aca-job-row-active" : ""}`}
    >
      <div className="aca-job-row-top">
        <strong>{job.id}</strong>
        {statusBadge(job.status)}
      </div>
      <div className="aca-job-meta">
        <span>{job.sourceLocale} → {job.targetLocale}</span>
        <span>{job.origin === "SHOPIFY_CHANGE" ? "Automatic · Shopify change" : "Manual"}</span>
        <span>{job.provider ?? "—"}{job.model ? ` · ${job.model}` : ""}</span>
        <span>{job.completedItems}/{job.totalItems} <UiText value="completed ·" /> {job.failedItems} failed</span>
        <span>{formatDateTime(job.createdAt)}</span>
      </div>
    </button>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="aca-card">
      <div className="aca-card-heading">
        <h2><UiText value={title} /></h2>
        {subtitle ? <p><UiText value={subtitle} /></p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="aca-field">
      <span><UiText value={label} /></span>
      {children}
    </label>
  );
}

function MiniStat({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
}) {
  return (
    <div className="aca-mini-stat">
      <div><UiText value={label} /></div>
      <strong>{valueNode ?? value ?? "—"}</strong>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ margin: "18px 0" }}>
      <div className="aca-progress-label">
        <span><UiText value={label} /></span>
        <strong>{value}%</strong>
      </div>
      <div className="aca-progress-track">
        <div className="aca-progress-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReadOnlyBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green";
}) {
  return (
    <div className="aca-field">
      <span><UiText value={label} /></span>
      <div
        className="aca-readonly"
        style={accent === "green" ? { borderColor: "#A9DDCC", background: ACA.greenSoft } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="aca-empty">
      <strong><UiText value={title} /></strong>
      <p><UiText value={text} /></p>
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: "blue" | "green" | "orange" }) {
  const styleMap = {
    blue: { background: ACA.blueSoft, color: ACA.blue },
    green: { background: ACA.greenSoft, color: ACA.green },
    orange: { background: ACA.orangeSoft, color: ACA.warning },
  };
  return <span className="aca-pill" style={styleMap[tone]}>{text}</span>;
}

function GlossaryRuleBadge({ rule }: { rule: GlossaryRuleType }) {
  const map: Record<GlossaryRuleType, { label: string; bg: string; fg: string }> = {
    DO_NOT_TRANSLATE: { label: "Keep", bg: ACA.blueSoft, fg: ACA.blue },
    PREFERRED_TRANSLATION: { label: "Prefer", bg: ACA.greenSoft, fg: ACA.success },
    FORBIDDEN_TRANSLATION: { label: "Forbid", bg: "#FDEAEA", fg: ACA.danger },
  };
  const value = map[rule];

  return (
    <span
      className="aca-pill"
      style={{ background: value.bg, color: value.fg }}
    >
      {value.label}
    </span>
  );
}

function InfoCallout({
  children,
  tone,
  style,
}: {
  children: ReactNode;
  tone: "blue" | "green" | "orange";
  style?: CSSProperties;
}) {
  const toneMap = {
    blue: { background: ACA.blueSoft, border: "#CAD9FF", color: ACA.blue },
    green: { background: ACA.greenSoft, border: "#BFE6D9", color: ACA.success },
    orange: { background: ACA.orangeSoft, border: "#FFD3A7", color: ACA.warning },
  };
  const selected = toneMap[tone];

  return (
    <div
      style={{
        ...style,
        padding: 14,
        borderRadius: 14,
        background: selected.background,
        border: `1px solid ${selected.border}`,
        color: selected.color,
        lineHeight: 1.55,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  label,
  actionKey,
  busyAction,
  onClick,
  primary,
  destructive,
  success,
}: {
  label: string;
  actionKey: string;
  busyAction: string | null;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
  success?: boolean;
}) {
  const isBusy = busyAction === actionKey;

  let background = ACA.white;
  let color = ACA.ink;
  let border = `1px solid ${ACA.line}`;

  if (primary) {
    background = ACA.blue;
    color = ACA.white;
    border = "1px solid transparent";
  }

  if (destructive) {
    background = "#FFF1F1";
    color = ACA.danger;
    border = "1px solid #F2C6C6";
  }

  if (success) {
    background = ACA.green;
    color = ACA.white;
    border = "1px solid transparent";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(busyAction)}
      className="aca-action-button"
      style={{
        border,
        background,
        color,
        opacity: busyAction && !isBusy ? 0.62 : 1,
      }}
    >
      <UiText value={isBusy ? `${label}…` : label} />
    </button>
  );
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);

  return rows;
}

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: ACA.textSoft,
  lineHeight: 1.6,
};

const sectionHeadingStyle: CSSProperties = {
  margin: "0 0 10px",
  color: ACA.ink,
  fontSize: 15,
  fontWeight: 800,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  border: `1px solid ${ACA.line}`,
  background: ACA.white,
  padding: "11px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  color: ACA.ink,
  outline: "none",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 720,
};

const tableHeadCellStyle: CSSProperties = {
  textAlign: "left",
  padding: "11px 12px",
  background: ACA.cream,
  color: ACA.ink,
  fontSize: 12,
  fontWeight: 800,
  borderBottom: `1px solid ${ACA.line}`,
};

const tableBodyCellStyle: CSSProperties = {
  padding: "11px 12px",
  fontSize: 12,
  borderBottom: `1px solid ${ACA.line}`,
  background: ACA.white,
  verticalAlign: "top",
};

const debugStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  lineHeight: 1.6,
  color: "#EAF2FF",
  background: "#102657",
  padding: 18,
  borderRadius: 16,
  overflowX: "auto",
};

const responsiveCss = `
  .aca-app-shell {
    min-height: 100vh;
    width: 100%;
    box-sizing: border-box;
    background: ${ACA.cream};
    color: ${ACA.ink};
    padding: 18px 22px 36px;
    font-family: Syne, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .aca-app-topline {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    margin-bottom: 14px;
  }

  .aca-header-tools { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
  .aca-language-picker { display: flex; flex-direction: column; gap: 5px; font-weight: 700; font-size: 11px; color: ${ACA.blue}; white-space: nowrap; }
  .aca-language-picker select { min-height: 36px; padding: 7px 10px; border: 1px solid ${ACA.line}; border-radius: 9px; background: #fff; color: ${ACA.ink}; font-size: 12px; }
  .aca-language-picker select:focus-visible { outline: 3px solid ${ACA.orange}; outline-offset: 2px; }
  .aca-header {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 24px;
    align-items: center;
    padding: 22px 24px;
    background: ${ACA.white};
    border: 1px solid ${ACA.line};
    border-radius: 20px;
    box-shadow: ${ACA.shadow};
  }

  .aca-brand-block {
    display: flex;
    align-items: center;
    gap: 22px;
    min-width: 0;
  }

  .aca-logo-wrap {
    flex: 0 0 auto;
    padding: 8px 14px;
    border-radius: 14px;
    background: ${ACA.cream};
    border: 1px solid ${ACA.line};
  }

  .aca-logo {
    display: block;
    width: 210px;
    max-width: 100%;
    height: auto;
  }

  .aca-eyebrow {
    display: inline-flex;
    align-items: center;
    padding: 5px 9px;
    margin-bottom: 7px;
    border-radius: 999px;
    background: ${ACA.blueSoft};
    color: ${ACA.blue};
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .aca-title {
    margin: 0;
    color: ${ACA.blue};
    font-size: clamp(25px, 2.3vw, 34px);
    line-height: 1.08;
    font-weight: 800;
  }

  .aca-subtitle {
    margin: 9px 0 0;
    max-width: 720px;
    color: ${ACA.textSoft};
    font-size: 13px;
    line-height: 1.55;
  }

  .aca-header-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .aca-header-stat {
    padding: 14px 12px;
    border-radius: 14px;
    border-top: 4px solid ${ACA.blue};
    background: ${ACA.cream};
    min-width: 0;
  }

  .aca-header-stat-label {
    color: ${ACA.textSoft};
    font-size: 11px;
    font-weight: 700;
  }

  .aca-header-stat-value {
    margin-top: 5px;
    font-size: 25px;
    line-height: 1;
    font-weight: 800;
  }

  .aca-tabs {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    gap: 7px;
    margin: 14px 0 18px;
    padding: 7px;
    overflow-x: auto;
    border: 1px solid ${ACA.line};
    border-radius: 16px;
    background: rgba(245, 243, 233, 0.94);
    backdrop-filter: blur(10px);
  }

  .aca-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px 13px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: ${ACA.textSoft};
    font-family: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .aca-tab:hover { background: ${ACA.white}; color: ${ACA.blue}; }
  .aca-tab-active {
    background: ${ACA.white};
    color: ${ACA.blue};
    border-color: ${ACA.line};
    box-shadow: 0 5px 14px rgba(19,60,153,0.08);
  }

  .aca-tab-short { display: none; }
  .aca-tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 999px;
    background: ${ACA.orangeSoft};
    color: ${ACA.warning};
    font-size: 10px;
  }

  .aca-main { width: 100%; }
  .aca-review-filters { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 8px; }
  .aca-review-choice { display: flex; align-items: center; gap: 9px; }
  .aca-review-choice > input { width: 17px; height: 17px; flex: none; accent-color: ${ACA.blue}; }
  .aca-review-choice > button { flex: 1; min-width: 0; }
  .aca-pricing-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .aca-pricing-table th, .aca-pricing-table td { padding: 7px 6px; border-bottom: 1px solid ${ACA.line}; text-align: left; vertical-align: middle; }
  .aca-pricing-table th { white-space: nowrap; }
  .aca-pricing-table input { width: 100%; box-sizing: border-box; }
  .aca-mini-action { border: 1px solid ${ACA.line}; border-radius: 8px; background: white; padding: 7px 10px; font: inherit; font-size: 11px; cursor: pointer; }
  .aca-mini-action:disabled { opacity: 0.5; cursor: not-allowed; }
  @media (max-width: 900px) { .aca-review-filters { grid-template-columns: 1fr 1fr; } }

  .aca-column-stack { display: grid; gap: 18px; align-content: start; }
  .aca-layout-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .aca-layout-jobs { display: grid; grid-template-columns: minmax(390px, 0.92fr) minmax(560px, 1.45fr); gap: 18px; }
  .aca-layout-review { display: grid; grid-template-columns: minmax(320px, 0.72fr) minmax(600px, 1.55fr); gap: 18px; }
  .aca-layout-glossary { display: grid; grid-template-columns: minmax(330px, 0.78fr) minmax(650px, 1.55fr); gap: 18px; }
  .aca-overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }

  .aca-card {
    min-width: 0;
    padding: 19px;
    background: ${ACA.white};
    border: 1px solid ${ACA.line};
    border-radius: 18px;
    box-shadow: ${ACA.shadow};
  }

  .aca-card-heading { margin-bottom: 15px; }
  .aca-card-heading h2 { margin: 0; color: ${ACA.blue}; font-size: 19px; line-height: 1.2; font-weight: 800; }
  .aca-card-heading p { margin: 5px 0 0; color: ${ACA.textSoft}; font-size: 12.5px; line-height: 1.5; }

  .aca-form-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .aca-form-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .aca-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .aca-stat-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .aca-stat-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

  .aca-field { display: grid; gap: 7px; min-width: 0; }
  .aca-field > span { color: ${ACA.ink}; font-size: 12px; font-weight: 800; }
  .aca-field-action { display: flex; align-items: end; }

  /* Shared button treatment: Jobs, International SEO, Operations and Markets. */
  .aca-btn {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    max-width: 100%;
    padding: 9px 14px;
    border: 1px solid ${ACA.line};
    border-radius: 10px;
    background: ${ACA.white};
    color: ${ACA.blue};
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(20, 51, 100, 0.04);
    transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }
  .aca-btn:hover:not(:disabled) { background: ${ACA.blueSoft}; border-color: #AFC1E5; box-shadow: 0 3px 10px rgba(20, 51, 100, 0.1); }
  .aca-btn:focus-visible { outline: 3px solid ${ACA.orange}; outline-offset: 2px; }
  .aca-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }

  /* International SEO: responsive, readable audit table. */
  .aca-seo-table-wrap {
    overflow-x: auto;
    max-width: 100%;
    margin-top: 14px;
    border: 1px solid ${ACA.line};
    border-radius: 13px;
    background: ${ACA.white};
  }
  .aca-seo-table-wrap:focus-visible { outline: 3px solid ${ACA.orange}; outline-offset: 2px; }
  .aca-seo-table { width: 100%; min-width: 560px; border-collapse: separate; border-spacing: 0; font-size: 12px; }
  .aca-seo-table th {
    padding: 12px 13px;
    background: ${ACA.cream};
    color: ${ACA.textSoft};
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid ${ACA.line};
  }
  .aca-seo-table td { padding: 13px; vertical-align: middle; border-bottom: 1px solid ${ACA.line}; color: ${ACA.ink}; line-height: 1.45; }
  .aca-seo-table tbody tr:last-child td { border-bottom: 0; }
  .aca-seo-table tbody tr:nth-child(even) { background: #FBFAF6; }
  .aca-seo-table tbody tr:hover { background: ${ACA.blueSoft}; }
  .aca-seo-locale { display: inline-flex; align-items: center; min-width: 30px; justify-content: center; padding: 5px 8px; border-radius: 8px; color: ${ACA.blue}; background: ${ACA.blueSoft}; font-weight: 800; }
  .aca-seo-resource { color: ${ACA.textSoft}; font-size: 11px; font-weight: 700; }
  .aca-seo-field { font-weight: 800; overflow-wrap: anywhere; }
  .aca-seo-status { display: inline-flex; align-items: center; justify-content: center; padding: 5px 9px; border-radius: 999px; font-size: 10px; font-weight: 800; white-space: nowrap; }
  .aca-seo-status--pass { background: ${ACA.greenSoft}; color: ${ACA.success}; }
  .aca-seo-status--review { background: ${ACA.orangeSoft}; color: ${ACA.warning}; }
  .aca-seo-status--error { background: #FDECEC; color: ${ACA.danger}; }
  .aca-seo-length { font-weight: 800; font-variant-numeric: tabular-nums; }
  .aca-seo-notes { color: ${ACA.textSoft}; min-width: 170px; }

  /* Markets & Localization: bounded tables, readable countries and locale states. */
  .aca-markets-table-wrap, .aca-market-locales-wrap {
    max-width: 100%; overflow-x: auto; margin-top: 12px;
    border: 1px solid ${ACA.line}; border-radius: 13px; background: ${ACA.white};
  }
  .aca-markets-table-wrap:focus-visible, .aca-market-locales-wrap:focus-visible { outline: 3px solid ${ACA.orange}; outline-offset: 2px; }
  .aca-markets-table, .aca-market-locales-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
  .aca-markets-table { min-width: 960px; table-layout: fixed; }
  .aca-markets-table th:nth-child(1) { width: 16%; }
  .aca-markets-table th:nth-child(2) { width: 9%; }
  .aca-markets-table th:nth-child(3) { width: 23%; }
  .aca-markets-table th:nth-child(4) { width: 10%; }
  .aca-markets-table th:nth-child(5) { width: 10%; }
  .aca-markets-table th:nth-child(6) { width: 10%; }
  .aca-markets-table th:nth-child(7) { width: 12%; }
  .aca-markets-table th:nth-child(8) { width: 10%; }
  .aca-market-locales-table { min-width: 480px; }
  .aca-markets-table th, .aca-market-locales-table th {
    padding: 12px; text-align: left; vertical-align: top;
    background: ${ACA.cream}; color: ${ACA.textSoft};
    font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.04em; line-height: 1.5; border-bottom: 1px solid ${ACA.line};
  }
  .aca-markets-table td, .aca-market-locales-table td {
    padding: 13px 12px; vertical-align: top; color: ${ACA.ink};
    border-bottom: 1px solid ${ACA.line}; line-height: 1.5; overflow-wrap: anywhere;
  }
  .aca-markets-table tbody tr:last-child td, .aca-market-locales-table tbody tr:last-child td { border-bottom: 0; }
  .aca-markets-table tbody tr:nth-child(even), .aca-market-locales-table tbody tr:nth-child(even) { background: #FBFAF6; }
  .aca-markets-table tbody tr:hover, .aca-market-locales-table tbody tr:hover { background: ${ACA.blueSoft}; }
  .aca-market-name strong { display: block; color: ${ACA.blue}; font-size: 12px; }
  .aca-market-name .aca-muted-small { margin-top: 5px; line-height: 1.5; }
  .aca-market-status, .aca-market-primary-badge {
    display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px;
    font-size: 10px; font-weight: 800; white-space: nowrap;
    background: ${ACA.blueSoft}; color: ${ACA.blue};
  }
  .aca-market-status--active { background: ${ACA.greenSoft}; color: ${ACA.success}; }
  .aca-market-status--inactive { background: ${ACA.cream}; color: ${ACA.textSoft}; }
  .aca-market-primary-badge { background: ${ACA.orangeSoft}; color: ${ACA.warning}; }
  .aca-market-countries { overflow-wrap: anywhere; }
  .aca-market-country-details summary { cursor: pointer; color: ${ACA.ink}; }
  .aca-market-country-details summary:focus-visible { outline: 2px solid ${ACA.orange}; outline-offset: 3px; }
  .aca-market-country-more { display: inline-block; color: ${ACA.blue}; font-size: 11px; font-weight: 800; }
  .aca-market-country-full { padding: 10px; margin-top: 9px; background: ${ACA.cream}; border-radius: 9px; color: ${ACA.textSoft}; font-size: 11px; }
  .aca-market-muted { color: ${ACA.textSoft}; }
  .aca-market-jobs-count { color: ${ACA.blue}; }
  .aca-market-urls a { color: ${ACA.blue}; overflow-wrap: anywhere; }

  /* Operations: readable provider result cards instead of raw inline paragraphs. */
  .aca-ops-provider-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 10px; margin-top: 12px; }
  .aca-ops-provider-card { padding: 14px; border: 1px solid ${ACA.line}; border-radius: 13px; background: ${ACA.cream}; }
  .aca-ops-provider-heading { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
  .aca-ops-provider-heading > strong { color: ${ACA.blue}; font-size: 13px; }
  .aca-ops-provider-state { padding: 5px 9px; border-radius: 999px; font-size: 10px; font-weight: 800; background: ${ACA.blueSoft}; color: ${ACA.blue}; }
  .aca-ops-provider-state--healthy { background: ${ACA.greenSoft}; color: ${ACA.success}; }
  .aca-ops-provider-state--recovered { background: ${ACA.orangeSoft}; color: ${ACA.warning}; }
  .aca-ops-provider-state--degraded { background: #FDECEC; color: ${ACA.danger}; }
  .aca-ops-provider-counts { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; color: ${ACA.textSoft}; font-size: 11px; }
  .aca-ops-provider-counts strong { color: ${ACA.ink}; font-size: 15px; }
  .aca-ops-provider-dates { display: grid; gap: 4px; margin-top: 10px; color: ${ACA.textSoft}; font-size: 10.5px; line-height: 1.5; }

  .aca-actions { display: flex; gap: 9px; flex-wrap: wrap; align-items: center; }
  .aca-glossary-checks { display: flex; gap: 18px; flex-wrap: wrap; color: ${ACA.ink}; font-size: 12px; font-weight: 700; }
  .aca-glossary-checks label { display: inline-flex; gap: 7px; align-items: center; }
  .aca-file-button { display: inline-flex; align-items: center; min-height: 38px; padding: 9px 13px; border-radius: 11px; border: 1px solid transparent; background: ${ACA.green}; color: ${ACA.white}; font-size: 12px; font-weight: 800; cursor: pointer; }
  .aca-file-button input { display: none; }
  .aca-glossary-actions { display: flex; gap: 9px; flex-wrap: wrap; }
  .aca-glossary-actions button { padding: 0; border: 0; background: transparent; color: ${ACA.blue}; font-family: inherit; font-size: 11px; font-weight: 800; cursor: pointer; text-decoration: underline; }
  .aca-glossary-actions .aca-danger-link { color: ${ACA.danger}; }

  .aca-action-button {
    min-height: 38px;
    padding: 9px 13px;
    border-radius: 11px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .aca-action-button:disabled { cursor: wait; }

  .aca-filter-row { display: grid; grid-template-columns: 1.5fr 0.8fr; gap: 10px; margin-bottom: 12px; }
  .aca-job-list { display: grid; gap: 9px; max-height: 590px; overflow: auto; padding-right: 3px; }
  .aca-job-row {
    display: block;
    width: 100%;
    text-align: left;
    padding: 13px;
    border: 1px solid ${ACA.line};
    border-radius: 14px;
    background: ${ACA.white};
    color: ${ACA.ink};
    font-family: inherit;
    cursor: pointer;
  }
  .aca-job-row:hover { border-color: #B6C7F2; background: #FBFCFF; }
  .aca-job-row-active { border: 2px solid ${ACA.orange}; background: #FFF9F3; }
  .aca-job-row-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .aca-job-row-top strong { font-size: 12px; word-break: break-all; }
  .aca-job-meta { display: grid; gap: 4px; margin-top: 9px; color: ${ACA.textSoft}; font-size: 11.5px; }

  .aca-mini-stat {
    min-width: 0;
    padding: 12px;
    border: 1px solid ${ACA.line};
    border-radius: 13px;
    background: ${ACA.cream};
  }
  .aca-mini-stat > div { margin-bottom: 6px; color: ${ACA.textSoft}; font-size: 10.5px; }
  .aca-mini-stat > strong { display: block; color: ${ACA.ink}; font-size: 12.5px; line-height: 1.45; word-break: break-word; }

  .aca-progress-label { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 7px; color: ${ACA.textSoft}; font-size: 11px; }
  .aca-progress-track { height: 9px; overflow: hidden; border-radius: 999px; background: #E6E1D6; }
  .aca-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, ${ACA.blue} 0%, ${ACA.orange} 50%, ${ACA.green} 100%); transition: width 220ms ease; }

  .aca-item-table-wrap { overflow-x: auto; border: 1px solid ${ACA.line}; border-radius: 13px; }
  .aca-review-list { display: grid; gap: 8px; max-height: 660px; overflow: auto; }
  .aca-review-row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    text-align: left;
    border: 1px solid ${ACA.line};
    border-radius: 13px;
    background: ${ACA.white};
    color: ${ACA.ink};
    font-family: inherit;
    cursor: pointer;
  }
  .aca-review-row:hover { border-color: #B6C7F2; }
  .aca-review-row-active { border: 2px solid ${ACA.green}; background: ${ACA.greenSoft}; }
  .aca-muted-small { color: ${ACA.textSoft}; font-size: 10.5px; line-height: 1.45; margin-top: 3px; }

  .aca-readonly {
    min-height: 120px;
    padding: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid ${ACA.line};
    border-radius: 13px;
    background: ${ACA.cream};
    color: ${ACA.ink};
    font-size: 12.5px;
    line-height: 1.6;
  }

  .aca-published-note { display: inline-flex; align-items: center; padding: 8px 11px; border-radius: 999px; background: ${ACA.greenSoft}; color: ${ACA.success}; font-size: 11px; font-weight: 800; }

  .aca-quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .aca-quick-action {
    min-height: 118px;
    padding: 14px;
    text-align: left;
    border: 1px solid ${ACA.line};
    border-top: 4px solid ${ACA.blue};
    border-radius: 14px;
    background: ${ACA.cream};
    color: ${ACA.ink};
    font-family: inherit;
    cursor: pointer;
  }
  .aca-quick-action strong { display: block; font-size: 13px; margin-bottom: 7px; }
  .aca-quick-action span { color: ${ACA.textSoft}; font-size: 11px; line-height: 1.5; }

  .aca-overview-job-list { display: grid; gap: 8px; }
  .aca-overview-job {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 11px 0;
    text-align: left;
    border: 0;
    border-bottom: 1px solid ${ACA.line};
    background: transparent;
    color: ${ACA.ink};
    font-family: inherit;
    cursor: pointer;
  }
  .aca-overview-job:last-child { border-bottom: 0; }

  .aca-language-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .aca-language-card { padding: 12px; border: 1px solid ${ACA.line}; border-radius: 13px; background: ${ACA.cream}; }
  .aca-pill { display: inline-flex; margin-right: 5px; padding: 4px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 800; }

  .aca-empty { padding: 25px 16px; text-align: center; border: 1px dashed ${ACA.line}; border-radius: 14px; background: ${ACA.cream}; }
  .aca-empty strong { display: block; color: ${ACA.ink}; font-size: 13px; }
  .aca-empty p { margin: 5px auto 0; max-width: 520px; color: ${ACA.textSoft}; font-size: 11.5px; line-height: 1.55; }

  .aca-debug-toggle-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
  .aca-debug-toggle { border: 0; background: transparent; color: ${ACA.textSoft}; font-family: inherit; font-size: 10px; cursor: pointer; text-decoration: underline; }
  .aca-debug-panel { margin-top: 8px; padding: 14px; border-radius: 16px; background: ${ACA.white}; border: 1px solid ${ACA.line}; }

  @media (max-width: 1180px) {
    .aca-header { grid-template-columns: 1fr; }
    .aca-header-stats { grid-template-columns: repeat(4, 1fr); }
    .aca-layout-jobs, .aca-layout-review, .aca-layout-glossary, .aca-overview-grid { grid-template-columns: 1fr; }
    .aca-layout-two { grid-template-columns: 1fr; }
  }

  @media (max-width: 760px) {
    .aca-app-shell { padding: 10px 10px 24px; }
    .aca-header { padding: 16px; }
    .aca-brand-block { align-items: flex-start; gap: 12px; }
    .aca-logo-wrap { padding: 6px 9px; }
    .aca-logo { width: 120px; }
    .aca-subtitle { display: none; }
    .aca-header-tools { justify-content: flex-start; }
    .aca-header-stats { grid-template-columns: repeat(2, 1fr); flex: 1 1 250px; }
    .aca-tab-label { display: none; }
    .aca-tab-short { display: inline; }
    .aca-form-grid-3, .aca-form-grid-2, .aca-two-column, .aca-stat-grid-4, .aca-stat-grid-3, .aca-quick-grid { grid-template-columns: 1fr; }
    .aca-filter-row { grid-template-columns: 1fr; }
    .aca-language-grid { grid-template-columns: 1fr; }
  }
`;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
