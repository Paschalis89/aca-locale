import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type AppTab =
  | "overview"
  | "scanner"
  | "jobs"
  | "review"
  | "languages"
  | "usage"
  | "settings";

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

type UsageSummary = {
  days?: number;
  totals?: {
    translation?: UsageTotals;
    aiReview?: UsageTotals;
    overall?: UsageTotals;
  };
  byProvider?: Array<{
    stage: string;
    provider: string;
    model?: string | null;
    events: number;
    estimatedCostMicrousd?: number;
    billedCharacters?: number;
    inputTokens?: number;
    outputTokens?: number;
  }>;
  daily?: unknown[];
  monthly?: unknown[];
};

type UsageTotals = {
  estimatedCostMicrousd?: number;
  billedCharacters?: number;
  inputTokens?: number;
  outputTokens?: number;
  events?: number;
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

type AiConfigurationForm = {
  translationProvider: string;
  translationModel: string;
  reviewProvider: string;
  reviewModel: string;
  fallbackProvider: string;
  fallbackModel: string;
};

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
  { id: "languages", label: "Languages", short: "Lang" },
  { id: "usage", label: "Usage", short: "Usage" },
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

  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
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

  const [scannerLocale, setScannerLocale] = useState("it");
  const [scannerResourceType, setScannerResourceType] = useState("PRODUCT");
  const [scannerResult, setScannerResult] = useState<ScannerResult | null>(null);

  const [syncResult, setSyncResult] = useState<any>(null);

  const [aiConfiguration, setAiConfiguration] = useState<AiConfigurationForm>({
    translationProvider: "DEEPL",
    translationModel: "",
    reviewProvider: "ANTHROPIC",
    reviewModel: "claude-sonnet-5-5",
    fallbackProvider: "OPENAI",
    fallbackModel: "gpt-6-luna",
  });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString();
  };

  const formatUsd = (microusd?: number) => {
    const usd = (microusd ?? 0) / 1_000_000;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(usd);
  };

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
        {status ?? "UNKNOWN"}
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
    await runAction(
      "create-job",
      async () => {
        const data = await apiCall("/api/backend/translation-jobs", {
          method: "POST",
          body: JSON.stringify({
            targetLocale,
            resourceTypes: [resourceType],
            maxItems,
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

  const publishItem = async () => {
    if (!requireItem()) return;

    await runAction(
      "publish-item",
      async () => {
        await apiCall(
          `/api/shopify/translation-jobs/${selectedJobId}/items/${selectedItemId}/publish`,
          { method: "POST" },
        );
        await loadJobDetail(selectedJobId);
        await loadJobs();
      },
      "Translation published to Shopify.",
    );
  };

  const scanStore = async () => {
    await runAction(
      "scan-store",
      async () => {
        const data = await apiCall(
          `/api/shopify/translatable-resources?resourceType=${encodeURIComponent(
            scannerResourceType,
          )}&locale=${encodeURIComponent(scannerLocale)}`,
          { method: "POST" },
        );
        setScannerResult(data);
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

  const locales =
    syncResult?.languages ?? syncResult?.locales ?? syncResult?.shopLanguages ?? [];
  const markets = syncResult?.markets ?? [];

  return (
    <div className="aca-app-shell">
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
            <h1 className="aca-title">Translation Operations</h1>
            <p className="aca-subtitle">
              Translation workflow, quality review and Shopify publication in
              one operational workspace.
            </p>
          </div>
        </div>

        <div className="aca-header-stats">
          <HeaderStat label="Jobs" value={dashboardStats.totalJobs} color={ACA.blue} />
          <HeaderStat label="Active" value={dashboardStats.activeJobs} color={ACA.orange} />
          <HeaderStat label="Review" value={dashboardStats.reviewItems} color={ACA.green} />
          <HeaderStat label="Published" value={dashboardStats.publishedItems} color={ACA.blue} />
        </div>
      </header>

      <nav className="aca-tabs" aria-label="ACA Locale sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`aca-tab ${activeTab === tab.id ? "aca-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="aca-tab-label">{tab.label}</span>
            <span className="aca-tab-short">{tab.short}</span>
            {tab.id === "review" && reviewQueue.length > 0 ? (
              <span className="aca-tab-count">{reviewQueue.length}</span>
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
              title="Store Scan"
              subtitle="Read the latest Shopify translatable content and refresh the local translation projection."
            >
              <div className="aca-form-grid-3">
                <Field label="Target locale">
                  <input
                    value={scannerLocale}
                    onChange={(event) => setScannerLocale(event.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Resource type">
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
                    label="Scan Shopify"
                    actionKey="scan-store"
                    busyAction={busyAction}
                    onClick={scanStore}
                    primary
                  />
                </div>
              </div>

              <InfoCallout tone="blue">
                A complete scan updates MISSING, TRANSLATED, OUTDATED and
                EMPTY_SOURCE states before new jobs are created.
              </InfoCallout>
            </Card>

            <Card
              title="Scan Result"
              subtitle="Coverage and translation state for the last completed scan."
            >
              {scannerResult?.summary ? (
                <>
                  <div className="aca-stat-grid-4">
                    <MiniStat label="Resources" value={String(scannerResult.summary.resources ?? 0)} />
                    <MiniStat label="Fields" value={String(scannerResult.summary.fields ?? 0)} />
                    <MiniStat label="Missing" value={String(scannerResult.summary.missing ?? 0)} />
                    <MiniStat label="Outdated" value={String(scannerResult.summary.outdated ?? 0)} />
                  </div>
                  <div className="aca-stat-grid-3" style={{ marginTop: 12 }}>
                    <MiniStat label="Translated" value={String(scannerResult.summary.translated ?? 0)} />
                    <MiniStat label="Empty source" value={String(scannerResult.summary.emptySource ?? 0)} />
                    <MiniStat label="Coverage" value={`${scannerResult.summary.coverage ?? 0}%`} />
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No scan yet"
                  text="Choose a locale and resource type, then run a Shopify scan."
                />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "jobs" ? (
          <div className="aca-layout-jobs">
            <div className="aca-column-stack">
              <Card title="Create Job" subtitle="Create and enqueue a background translation job.">
                <div className="aca-form-grid-3">
                  <Field label="Target locale">
                    <input
                      value={targetLocale}
                      onChange={(event) => setTargetLocale(event.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Resource type">
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
                  <Field label="Max items">
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
                    label="Refresh"
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

              <Card title="Jobs" subtitle="Search and filter translation job history.">
                <div className="aca-filter-row">
                  <input
                    value={jobSearch}
                    onChange={(event) => setJobSearch(event.target.value)}
                    placeholder="Search job, locale, provider…"
                    style={inputStyle}
                  />
                  <select
                    value={jobStatusFilter}
                    onChange={(event) => setJobStatusFilter(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="QUEUED">QUEUED</option>
                    <option value="RUNNING">RUNNING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                {loadingJobs ? (
                  <p style={mutedTextStyle}>Loading jobs…</p>
                ) : jobsError ? (
                  <p style={{ ...mutedTextStyle, color: ACA.danger }}>{jobsError}</p>
                ) : filteredJobs.length === 0 ? (
                  <EmptyState title="No jobs found" text="Create a job or change your filters." />
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
              title="Job Detail"
              subtitle="Lifecycle, progress, providers and item-level status."
            >
              {selectedJob ? (
                <>
                  <div className="aca-stat-grid-4">
                    <MiniStat label="Status" valueNode={statusBadge(selectedJob.status)} />
                    <MiniStat
                      label="Translation"
                      value={`${selectedJob.provider ?? "—"}${selectedJob.model ? ` · ${selectedJob.model}` : ""}`}
                    />
                    <MiniStat
                      label="AI review"
                      value={`${selectedJob.reviewProvider ?? "—"}${selectedJob.reviewModel ? ` · ${selectedJob.reviewModel}` : ""}`}
                    />
                    <MiniStat label="Progress" value={`${progress}%`} />
                  </div>

                  <ProgressBar
                    value={progress}
                    label={`${selectedJob.completedItems}/${selectedJob.totalItems} completed · ${selectedJob.failedItems} failed`}
                  />

                  <div className="aca-stat-grid-3">
                    <MiniStat label="Started" value={formatDateTime(selectedJob.startedAt)} />
                    <MiniStat label="Completed" value={formatDateTime(selectedJob.completedAt)} />
                    <MiniStat label="Error" value={selectedJob.errorMessage ?? "None"} />
                  </div>

                  <div className="aca-actions" style={{ marginTop: 18 }}>
                    {selectedJob.status === "QUEUED" ? (
                      <ActionButton
                        label="Execute now"
                        actionKey="execute-job"
                        busyAction={busyAction}
                        onClick={executeJob}
                      />
                    ) : null}
                    {canReviewJob ? (
                      <ActionButton
                        label="Run AI Review"
                        actionKey="review-job"
                        busyAction={busyAction}
                        onClick={reviewJob}
                        primary
                      />
                    ) : null}
                    {canRetryJob ? (
                      <ActionButton
                        label="Retry Failed"
                        actionKey="retry-failed-job"
                        busyAction={busyAction}
                        onClick={retryFailedJob}
                      />
                    ) : null}
                    {canResumeJob ? (
                      <ActionButton
                        label="Resume"
                        actionKey="resume-job"
                        busyAction={busyAction}
                        onClick={resumeJob}
                      />
                    ) : null}
                    {canCancelJob ? (
                      <ActionButton
                        label="Cancel"
                        actionKey="cancel-job"
                        busyAction={busyAction}
                        onClick={cancelJob}
                        destructive
                      />
                    ) : null}
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <h3 style={sectionHeadingStyle}>Items</h3>
                    <div className="aca-item-table-wrap">
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={tableHeadCellStyle}>Field</th>
                            <th style={tableHeadCellStyle}>Resource</th>
                            <th style={tableHeadCellStyle}>Status</th>
                            <th style={tableHeadCellStyle}>Provider</th>
                            <th style={tableHeadCellStyle}>AI score</th>
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
                <EmptyState title="Select a job" text="Choose a job from the list to inspect its lifecycle and items." />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="aca-layout-review">
            <Card title="Review Queue" subtitle="Validated items waiting for human decision or AI-assisted review.">
              {reviewQueue.length === 0 ? (
                <EmptyState title="Review queue is empty" text="Validated and NEEDS_REVIEW items will appear here." />
              ) : (
                <div className="aca-review-list">
                  {reviewQueue.map(({ job, item }) => (
                    <button
                      key={item.id}
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
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {statusBadge(item.status)}
                        <div className="aca-muted-small" style={{ marginTop: 6 }}>
                          AI {item.aiReviewScore ?? "—"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Human Review"
              subtitle="Compare source and generated text, edit the final value and publish after approval."
            >
              {selectedItem && selectedJob ? (
                <div className="aca-column-stack">
                  <div className="aca-stat-grid-4">
                    <MiniStat label="Status" valueNode={statusBadge(selectedItem.status)} />
                    <MiniStat label="Field" value={selectedItem.field?.key ?? "—"} />
                    <MiniStat label="Type" value={selectedItem.field?.type ?? "—"} />
                    <MiniStat label="AI score" value={selectedItem.aiReviewScore?.toString() ?? "—"} />
                  </div>

                  {selectedJob.items && selectedJob.items.length > 1 ? (
                    <Field label="Translation item">
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
                    <ReadOnlyBlock label="Source value" value={selectedItem.sourceValue} />
                    <ReadOnlyBlock label="Generated translation" value={selectedItem.translatedValue ?? "—"} />
                  </div>

                  {selectedItem.aiReviewSuggestedTranslation ? (
                    <ReadOnlyBlock
                      label="AI suggested translation"
                      value={selectedItem.aiReviewSuggestedTranslation}
                      accent="green"
                    />
                  ) : null}

                  <Field label="Approved value">
                    <textarea
                      value={approvedValue}
                      onChange={(event) => setApprovedValue(event.target.value)}
                      style={{ ...inputStyle, minHeight: 150, resize: "vertical" }}
                    />
                  </Field>

                  <div className="aca-two-column">
                    <Field label="Approval note">
                      <textarea
                        value={approveNote}
                        onChange={(event) => setApproveNote(event.target.value)}
                        style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                      />
                    </Field>
                    <Field label="Rejection note">
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
                        label="Approve"
                        actionKey="approve-item"
                        busyAction={busyAction}
                        onClick={approveItem}
                        primary
                      />
                    ) : null}
                    {canApproveItem ? (
                      <ActionButton
                        label="Reject"
                        actionKey="reject-item"
                        busyAction={busyAction}
                        onClick={rejectItem}
                        destructive
                      />
                    ) : null}
                    {canRegenerateItem ? (
                      <ActionButton
                        label="Regenerate"
                        actionKey="regenerate-item"
                        busyAction={busyAction}
                        onClick={regenerateItem}
                      />
                    ) : null}
                    {canPublishItem ? (
                      <ActionButton
                        label="Publish to Shopify"
                        actionKey="publish-item"
                        busyAction={busyAction}
                        onClick={publishItem}
                        success
                      />
                    ) : null}
                    {selectedItem.status === "PUBLISHED" ? (
                      <span className="aca-published-note">Published to Shopify</span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState title="Select an item" text="Choose a translation from the review queue or a job detail." />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "languages" ? (
          <div className="aca-layout-two">
            <Card
              title="Shopify Configuration"
              subtitle="Synchronize source language, published locales and Shopify Markets."
            >
              <div className="aca-actions">
                <ActionButton
                  label="Sync Shopify"
                  actionKey="sync-shopify"
                  busyAction={busyAction}
                  onClick={syncShopifyConfiguration}
                  primary
                />
              </div>
              <div style={{ marginTop: 18 }}>
                <InfoCallout tone="green">
                  ACA Locale uses Shopify as the source of truth. Run this sync after changing languages or Markets in Shopify Admin.
                </InfoCallout>
              </div>
            </Card>

            <Card title="Languages & Markets" subtitle="Last synchronized Shopify configuration.">
              {syncResult ? (
                <div className="aca-column-stack">
                  {Array.isArray(locales) && locales.length > 0 ? (
                    <div>
                      <h3 style={sectionHeadingStyle}>Languages</h3>
                      <div className="aca-language-grid">
                        {locales.map((locale: any, index: number) => (
                          <div key={locale.locale ?? locale.id ?? index} className="aca-language-card">
                            <strong>{locale.name ?? locale.locale ?? "Language"}</strong>
                            <div className="aca-muted-small">{locale.locale ?? "—"}</div>
                            <div style={{ marginTop: 8 }}>
                              {locale.primary ? <Pill text="Primary" tone="blue" /> : null}
                              {locale.published ? <Pill text="Published" tone="green" /> : <Pill text="Unpublished" tone="orange" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(markets) && markets.length > 0 ? (
                    <div>
                      <h3 style={sectionHeadingStyle}>Markets</h3>
                      <div className="aca-language-grid">
                        {markets.map((market: any, index: number) => (
                          <div key={market.id ?? index} className="aca-language-card">
                            <strong>{market.name ?? "Market"}</strong>
                            <div className="aca-muted-small">{market.handle ?? market.status ?? "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!Array.isArray(locales) && !Array.isArray(markets) ? (
                    <pre style={debugStyle}>{JSON.stringify(syncResult, null, 2)}</pre>
                  ) : null}
                </div>
              ) : (
                <EmptyState title="Not synchronized in this session" text="Run Shopify sync to view current languages and markets." />
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "usage" ? (
          <Card
            title="Usage & Cost Monitoring"
            subtitle="30-day translation and AI review consumption."
          >
            <div className="aca-actions" style={{ marginBottom: 18 }}>
              <ActionButton
                label="Refresh Usage"
                actionKey="refresh-usage"
                busyAction={busyAction}
                onClick={() => void runAction("refresh-usage", loadUsage, "Usage refreshed.")}
              />
            </div>

            {loadingUsage ? (
              <p style={mutedTextStyle}>Loading usage summary…</p>
            ) : usageError ? (
              <p style={{ ...mutedTextStyle, color: ACA.danger }}>{usageError}</p>
            ) : usageSummary ? (
              <>
                <div className="aca-stat-grid-4">
                  <MiniStat label="Total cost" value={formatUsd(usageSummary.totals?.overall?.estimatedCostMicrousd)} />
                  <MiniStat label="DeepL characters" value={String(usageSummary.totals?.translation?.billedCharacters ?? 0)} />
                  <MiniStat label="LLM input tokens" value={String(usageSummary.totals?.overall?.inputTokens ?? 0)} />
                  <MiniStat label="LLM output tokens" value={String(usageSummary.totals?.overall?.outputTokens ?? 0)} />
                </div>

                <div className="aca-item-table-wrap" style={{ marginTop: 20 }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={tableHeadCellStyle}>Stage</th>
                        <th style={tableHeadCellStyle}>Provider</th>
                        <th style={tableHeadCellStyle}>Model</th>
                        <th style={tableHeadCellStyle}>Events</th>
                        <th style={tableHeadCellStyle}>Characters</th>
                        <th style={tableHeadCellStyle}>Input tokens</th>
                        <th style={tableHeadCellStyle}>Output tokens</th>
                        <th style={tableHeadCellStyle}>Estimated cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(usageSummary.byProvider ?? []).map((row) => (
                        <tr key={`${row.stage}-${row.provider}-${row.model ?? "none"}`}>
                          <td style={tableBodyCellStyle}>{row.stage}</td>
                          <td style={tableBodyCellStyle}>{row.provider}</td>
                          <td style={tableBodyCellStyle}>{row.model ?? "—"}</td>
                          <td style={tableBodyCellStyle}>{row.events}</td>
                          <td style={tableBodyCellStyle}>{row.billedCharacters ?? 0}</td>
                          <td style={tableBodyCellStyle}>{row.inputTokens ?? 0}</td>
                          <td style={tableBodyCellStyle}>{row.outputTokens ?? 0}</td>
                          <td style={tableBodyCellStyle}>{formatUsd(row.estimatedCostMicrousd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <InfoCallout tone="orange" style={{ marginTop: 18 }}>
                  Estimated cost is based on the pricing configuration currently stored for ACA Locale. Replace test pricing before production billing decisions.
                </InfoCallout>
              </>
            ) : (
              <EmptyState title="No usage data" text="Usage events will appear after translations or AI reviews are executed." />
            )}
          </Card>
        ) : null}

        {activeTab === "settings" ? (
          <div className="aca-layout-two">
            <Card
              title="Translation Engine"
              subtitle="Choose the primary translation provider and fallback used for future jobs."
            >
              <div className="aca-form-grid-2">
                <Field label="Translation provider">
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
                <Field label="Translation model">
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
                <Field label="Fallback provider">
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
                    <option value="">No fallback</option>
                    <option value="OPENAI">OpenAI</option>
                    <option value="ANTHROPIC">Anthropic</option>
                    <option value="GOOGLE">Google</option>
                    <option value="DEEPL">DeepL</option>
                  </select>
                </Field>
                <Field label="Fallback model">
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
              title="AI Review"
              subtitle="Configure the quality reviewer snapshotted when new jobs are created."
            >
              <div className="aca-form-grid-2">
                <Field label="Review provider">
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
                <Field label="Review model">
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
                  label="Save Configuration"
                  actionKey="save-ai-config"
                  busyAction={busyAction}
                  onClick={saveAiConfiguration}
                  primary
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <InfoCallout tone="blue">
                  Configuration changes affect only new jobs. Existing jobs keep their snapshotted provider and model history.
                </InfoCallout>
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
          {showDebug ? "Hide developer response" : "Show developer response"}
        </button>
      </div>

      {showDebug ? (
        <div className="aca-debug-panel">
          <pre style={debugStyle}>
            {lastResult
              ? JSON.stringify(lastResult, null, 2)
              : "No request executed yet."}
          </pre>
        </div>
      ) : null}
    </div>
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
  const active = jobs.filter(
    (job) => job.status === "QUEUED" || job.status === "RUNNING",
  );

  return (
    <div className="aca-overview-grid">
      <div className="aca-column-stack">
        <Card title="Quick Actions" subtitle="Start from the most common operational tasks.">
          <div className="aca-quick-grid">
            <QuickAction title="Scan Store" text="Refresh Shopify translation state before creating jobs." color={ACA.green} onClick={onGoToScanner} />
            <QuickAction title="Create / Manage Jobs" text="Translate missing or outdated fields in the background." color={ACA.blue} onClick={onGoToJobs} />
            <QuickAction title="Review Queue" text={`${reviewQueue.length} items currently waiting for a decision.`} color={ACA.orange} onClick={onGoToReview} />
          </div>
        </Card>

        <Card title="Recent Jobs" subtitle="Latest translation activity.">
          {jobs.length === 0 ? (
            <EmptyState title="No jobs yet" text="Scan Shopify and create your first translation job." />
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
        <Card title="Operations" subtitle="Current queue and review workload.">
          <div className="aca-stat-grid-3">
            <MiniStat label="Active jobs" value={String(active.length)} />
            <MiniStat label="Review items" value={String(reviewQueue.length)} />
            <MiniStat label="Recent jobs" value={String(jobs.length)} />
          </div>

          {reviewQueue.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <h3 style={sectionHeadingStyle}>Needs attention</h3>
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

        <Card title="30-day Usage" subtitle="Provider consumption and estimated spend.">
          {loadingUsage ? (
            <p style={mutedTextStyle}>Loading usage…</p>
          ) : usageError ? (
            <p style={{ ...mutedTextStyle, color: ACA.danger }}>{usageError}</p>
          ) : usageSummary ? (
            <div className="aca-stat-grid-3">
              <MiniStat label="Estimated cost" value={formatUsd(usageSummary.totals?.overall?.estimatedCostMicrousd)} />
              <MiniStat label="Characters" value={String(usageSummary.totals?.overall?.billedCharacters ?? 0)} />
              <MiniStat label="LLM tokens" value={String((usageSummary.totals?.overall?.inputTokens ?? 0) + (usageSummary.totals?.overall?.outputTokens ?? 0))} />
            </div>
          ) : (
            <EmptyState title="No usage data" text="Usage appears after translation or AI review calls." />
          )}
        </Card>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="aca-header-stat" style={{ borderTopColor: color }}>
      <div className="aca-header-stat-label">{label}</div>
      <div className="aca-header-stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

function QuickAction({ title, text, color, onClick }: { title: string; text: string; color: string; onClick: () => void }) {
  return (
    <button type="button" className="aca-quick-action" onClick={onClick} style={{ borderTopColor: color }}>
      <strong>{title}</strong>
      <span>{text}</span>
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
        <span>{job.provider ?? "—"}{job.model ? ` · ${job.model}` : ""}</span>
        <span>{job.completedItems}/{job.totalItems} completed · {job.failedItems} failed</span>
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
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="aca-field">
      <span>{label}</span>
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
      <div>{label}</div>
      <strong>{valueNode ?? value ?? "—"}</strong>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ margin: "18px 0" }}>
      <div className="aca-progress-label">
        <span>{label}</span>
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
      <span>{label}</span>
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
      <strong>{title}</strong>
      <p>{text}</p>
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
      {isBusy ? `${label}…` : label}
    </button>
  );
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

  .aca-header {
    display: grid;
    grid-template-columns: minmax(420px, 1.4fr) minmax(480px, 1fr);
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
  .aca-column-stack { display: grid; gap: 18px; align-content: start; }
  .aca-layout-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .aca-layout-jobs { display: grid; grid-template-columns: minmax(390px, 0.92fr) minmax(560px, 1.45fr); gap: 18px; }
  .aca-layout-review { display: grid; grid-template-columns: minmax(320px, 0.72fr) minmax(600px, 1.55fr); gap: 18px; }
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
  .aca-actions { display: flex; gap: 9px; flex-wrap: wrap; align-items: center; }

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
    .aca-layout-jobs, .aca-layout-review, .aca-overview-grid { grid-template-columns: 1fr; }
    .aca-layout-two { grid-template-columns: 1fr; }
  }

  @media (max-width: 760px) {
    .aca-app-shell { padding: 10px 10px 24px; }
    .aca-header { padding: 16px; }
    .aca-brand-block { align-items: flex-start; gap: 12px; }
    .aca-logo-wrap { padding: 6px 9px; }
    .aca-logo { width: 120px; }
    .aca-subtitle { display: none; }
    .aca-header-stats { grid-template-columns: repeat(2, 1fr); }
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
