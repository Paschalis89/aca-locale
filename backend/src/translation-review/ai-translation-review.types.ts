import type { ResolvedGlossaryRule } from '../glossary/glossary.types.js';

export type AiTranslationReviewSeverity = 'ERROR' | 'WARNING';

export type AiTranslationReviewIssue = {
  code: string;

  severity: AiTranslationReviewSeverity;

  message: string;
};

export type AiTranslationReviewInput = {
  sourceValue: string;

  translatedValue: string;

  sourceLocale: string;

  targetLocale: string;

  resourceType?: string;

  fieldKey?: string;

  contentType?: string;

  provider: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE';

  model: string;

  glossaryRules?: ResolvedGlossaryRule[];
};

export type AiTranslationReviewResult = {
  approved: boolean;

  score: number;

  issues: AiTranslationReviewIssue[];

  suggestedTranslation: string | null;

  provider: 'OPENAI' | 'ANTHROPIC' | 'GOOGLE';

  model: string;

  inputTokens: number;

  outputTokens: number;
};
