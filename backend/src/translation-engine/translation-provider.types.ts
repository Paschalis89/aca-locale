export type TranslationProviderName =
  | 'OPENAI'
  | 'ANTHROPIC'
  | 'GOOGLE'
  | 'DEEPL';

export type TranslationProviderInput = {
  text: string;

  sourceLocale: string;

  targetLocale: string;

  contentType?: string;

  resourceType?: string;

  fieldKey?: string;

  model?: string | null;
};

export type TranslationProviderResult = {
  text: string;

  provider: TranslationProviderName;

  model: string | null;

  billedCharacters?: number;

  inputTokens?: number;

  outputTokens?: number;
};

export interface TranslationProviderAdapter {
  readonly provider:
    TranslationProviderName;

  translate(
    input: TranslationProviderInput,
  ): Promise<TranslationProviderResult>;
}