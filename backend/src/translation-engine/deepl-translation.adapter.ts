import {
  Injectable,
} from '@nestjs/common';

import {
  DeepLTranslationService,
} from './deepl-translation.service.js';

import type {
  TranslationProviderAdapter,
  TranslationProviderInput,
  TranslationProviderResult,
} from './translation-provider.types.js';

@Injectable()
export class DeepLTranslationAdapter
  implements TranslationProviderAdapter
{
  readonly provider =
    'DEEPL' as const;

  constructor(
    private readonly deepL:
      DeepLTranslationService,
  ) {}

  async translate(
    input:
      TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    const result =
      await this.deepL.translate({
        text:
          input.text,

        sourceLocale:
          input.sourceLocale,

        targetLocale:
          input.targetLocale,

        contentType:
          input.contentType,
      });

    return {
      text:
        result.text,

      provider:
        'DEEPL',

      model:
        null,

      billedCharacters:
        result.billedCharacters,
    };
  }
}