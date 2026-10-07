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
export class AnthropicTranslationAdapter
  implements TranslationProviderAdapter
{
  readonly provider =
    'ANTHROPIC' as const;

  constructor(
    private readonly llm:
      LlmTranslationService,
  ) {}

  translate(
    input:
      TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    return this.llm.translate(
      'ANTHROPIC',
      input,
    );
  }
}