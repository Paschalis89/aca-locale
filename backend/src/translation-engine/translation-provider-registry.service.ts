import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  AnthropicTranslationAdapter,
} from './anthropic-translation.adapter.js';

import {
  DeepLTranslationAdapter,
} from './deepl-translation.adapter.js';

import {
  GoogleTranslationAdapter,
} from './google-translation.adapter.js';

import {
  OpenAiTranslationAdapter,
} from './openai-translation.adapter.js';

import type {
  TranslationProviderAdapter,
  TranslationProviderName,
} from './translation-provider.types.js';

@Injectable()
export class TranslationProviderRegistryService {
  constructor(
    private readonly deepL:
      DeepLTranslationAdapter,

    private readonly openAi:
      OpenAiTranslationAdapter,

    private readonly anthropic:
      AnthropicTranslationAdapter,

    private readonly google:
      GoogleTranslationAdapter,
  ) {}

  getProvider(
    provider:
      TranslationProviderName,
  ): TranslationProviderAdapter {
    switch (
      provider
    ) {
      case 'DEEPL':
        return this.deepL;

      case 'OPENAI':
        return this.openAi;

      case 'ANTHROPIC':
        return this.anthropic;

      case 'GOOGLE':
        return this.google;

      default:
        throw new BadRequestException(
          `Unsupported translation provider "${provider}".`,
        );
    }
  }
}