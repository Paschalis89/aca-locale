export type TranslationValidationSeverity = 'ERROR' | 'WARNING';

export type TranslationValidationCode =
  | 'EMPTY_TRANSLATION'
  | 'LIQUID_TOKEN_MISMATCH'
  | 'PLACEHOLDER_MISMATCH'
  | 'URL_MISMATCH'
  | 'EMAIL_MISMATCH'
  | 'HTML_STRUCTURE_MISMATCH'
  | 'NUMBER_TOKEN_MISMATCH'
  | 'SAME_AS_SOURCE'
  | 'LENGTH_RATIO_LOW'
  | 'LENGTH_RATIO_HIGH';

export type TranslationValidationIssue = {
  code: TranslationValidationCode;

  severity: TranslationValidationSeverity;

  message: string;

  expected?: string[];

  actual?: string[];
};

export type TranslationValidationInput = {
  sourceValue: string;

  translatedValue: string;

  sourceLocale: string;

  targetLocale: string;

  contentType?: string;

  resourceType?: string;

  fieldKey?: string;
};

export type TranslationValidationResult = {
  version: string;

  passed: boolean;

  errorCount: number;

  warningCount: number;

  issues: TranslationValidationIssue[];
};
