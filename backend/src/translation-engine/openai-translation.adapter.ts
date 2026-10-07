import {
  Injectable,
} from '@nestjs/common';

import {
  LlmTranslationService,
} from './llm-translation.service.js';

import type {
  TranslationProviderAdapter,
  TranslationProviderInput,
  TranslationProviderResult,
} from './translation-provider.types.js';

@Injectable()
export class OpenAiTranslationAdapter
  implements TranslationProviderAdapter
{
  readonly provider =
    'OPENAI' as const;

  constructor(
    private readonly llm:
      LlmTranslationService,
  ) {}

  translate(
    input:
      TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    return this.llm.translate(
      'OPENAI',
      input,
    );
  }
}