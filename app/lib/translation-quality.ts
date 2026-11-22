/**
 * ACA Locale Quality Studio: a read-only summary of persisted deterministic validation.
 * This is NOT a semantic translation grade or a revalidation of an unsaved edit.
 * The NestJS validator remains authoritative for approval/publication decisions.
 */
export type QualityIssue = {
  code: string;
  severity: "ERROR" | "WARNING";
  message: string;
  group: "Terminology" | "HTML & markup" | "Placeholders & Liquid" | "Links & contacts" | "Content";
};

export type QualitySnapshot = {
  state: "NOT_CHECKED" | "BLOCKED" | "REVIEW" | "PASSED";
  score: number | null;
  errors: number;
  warnings: number;
  issues: QualityIssue[];
  moreIssues: number;
};

type QualityItem = {
  validationPassed?: boolean | null;
  validationErrors?: number | null;
  validationWarnings?: number | null;
  validationIssues?: unknown;
  validationVersion?: string | null;
};

const categoryFor = (code: string): QualityIssue["group"] => {
  if (code.startsWith("GLOSSARY_")) return "Terminology";
  if (code.startsWith("HTML_")) return "HTML & markup";
  if (code.startsWith("LIQUID_") || code.startsWith("PLACEHOLDER_")) return "Placeholders & Liquid";
  if (code.startsWith("URL_") || code.startsWith("EMAIL_")) return "Links & contacts";
  return "Content";
};

const safeCount = (count: unknown): number =>
  typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;

/** Preserve only known, bounded fields; do not show raw arbitrary database JSON. */
export function qualitySnapshot(item: QualityItem): QualitySnapshot {
  const known = item.validationPassed === true || item.validationPassed === false;
  if (!known) return { state: "NOT_CHECKED", score: null, errors: 0, warnings: 0, issues: [], moreIssues: 0 };

  const errors = safeCount(item.validationErrors);
  const warnings = safeCount(item.validationWarnings);
  const parsed = Array.isArray(item.validationIssues) ? item.validationIssues : [];
  const issues: QualityIssue[] = parsed.slice(0, 30).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.code !== "string" || !/^[A-Z0-9_]{1,80}$/.test(candidate.code)) return [];
    if (candidate.severity !== "ERROR" && candidate.severity !== "WARNING") return [];
    // Do not render raw provider/AI error messages in the interface.
    const message = typeof candidate.message === "string" ? candidate.message.slice(0, 400) : candidate.code.replaceAll("_", " ");
    return [{ code: candidate.code, severity: candidate.severity, message, group: categoryFor(candidate.code) }];
  });
  const blocked = item.validationPassed === false || errors > 0;
  const score = blocked ? Math.min(49, Math.max(0, 100 - errors * 25 - warnings * 7)) : Math.max(50, 100 - warnings * 7);
  return {
    state: blocked ? "BLOCKED" : warnings > 0 ? "REVIEW" : "PASSED",
    score,
    errors,
    warnings,
    issues,
    moreIssues: Math.max(0, parsed.length - 30),
  };
}
