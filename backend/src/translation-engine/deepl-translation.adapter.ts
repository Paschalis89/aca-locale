import { Injectable } from '@nestjs/common';

import {
  protectGlossaryTerms,
  restoreGlossaryTerms,
} from '../glossary/glossary-rule.utils.js';

import { DeepLTranslationService } from './deepl-translation.service.js';

import type {
  TranslationProviderAdapter,
  TranslationProviderInput,
  TranslationProviderResult,
} from './translation-provider.types.js';

@Injectable()
export class DeepLTranslationAdapter implements TranslationProviderAdapter {
  readonly provider = 'DEEPL' as const;

  constructor(private readonly deepL: DeepLTranslationService) {}

  async translate(
    input: TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    const protectedInput =
      protectGlossaryTerms(
        input.text,
        input.glossaryRules ?? [],
      );

    const result = await this.deepL.translate({
      text: protectedInput.text,

      sourceLocale: input.sourceLocale,

      targetLocale: input.targetLocale,

      contentType: input.contentType,
    });

    return {
      text: restoreGlossaryTerms(
        result.text,
        protectedInput.protections,
      ),

      provider: 'DEEPL',

      model: null,

      billedCharacters: result.billedCharacters,
    };
  }
}
