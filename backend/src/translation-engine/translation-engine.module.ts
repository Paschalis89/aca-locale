import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  AnthropicTranslationAdapter,
} from './anthropic-translation.adapter.js';

import {
  DeepLTranslationAdapter,
} from './deepl-translation.adapter.js';

import {
  DeepLTranslationService,
} from './deepl-translation.service.js';

import {
  GoogleTranslationAdapter,
} from './google-translation.adapter.js';

import {
  LlmTranslationService,
} from './llm-translation.service.js';

import {
  OpenAiTranslationAdapter,
} from './openai-translation.adapter.js';

import {
  TranslationExecutorService,
} from './translation-executor.service.js';

import {
  TranslationProviderRegistryService,
} from './translation-provider-registry.service.js';

import {
  TranslationValidationModule,
} from '../translation-validation/translation-validation.module.js';

@Module({
  imports: [
    DatabaseModule,
    TranslationValidationModule
  ],

  providers: [
    DeepLTranslationService,
    LlmTranslationService,

    DeepLTranslationAdapter,
    OpenAiTranslationAdapter,
    AnthropicTranslationAdapter,
    GoogleTranslationAdapter,

    TranslationProviderRegistryService,
    TranslationExecutorService,
  ],

  exports: [
    DeepLTranslationService,
    LlmTranslationService,

    DeepLTranslationAdapter,
    OpenAiTranslationAdapter,
    AnthropicTranslationAdapter,
    GoogleTranslationAdapter,

    TranslationProviderRegistryService,
    TranslationExecutorService,
  ],
})
export class TranslationEngineModule {}