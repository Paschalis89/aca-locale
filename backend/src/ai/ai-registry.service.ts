import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  createAnthropic,
  type AnthropicProvider,
} from '@ai-sdk/anthropic';

import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from '@ai-sdk/google';

import {
  createOpenAI,
  type OpenAIProvider,
} from '@ai-sdk/openai';

type SupportedAiProvider =
  | 'openai'
  | 'anthropic'
  | 'google';

type AiModelId =
  `${SupportedAiProvider}:${string}`;

@Injectable()
export class AiRegistryService {
  private readonly openai: OpenAIProvider;

  private readonly anthropic: AnthropicProvider;

  private readonly google: GoogleGenerativeAIProvider;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const openAiApiKey =
      this.configService.get<string>(
        'OPENAI_API_KEY',
      );

    const anthropicApiKey =
      this.configService.get<string>(
        'ANTHROPIC_API_KEY',
      );

    const googleApiKey =
      this.configService.get<string>(
        'GOOGLE_GENERATIVE_AI_API_KEY',
      );

    this.openai = createOpenAI(
      openAiApiKey
        ? {
            apiKey: openAiApiKey,
          }
        : {},
    );

    this.anthropic = createAnthropic(
      anthropicApiKey
        ? {
            apiKey: anthropicApiKey,
          }
        : {},
    );

    this.google = createGoogleGenerativeAI(
      googleApiKey
        ? {
            apiKey: googleApiKey,
          }
        : {},
    );
  }

  getTranslationModel(
    modelId?: string,
  ) {
    const resolvedModelId =
      modelId ??
      this.configService.get<string>(
        'AI_TRANSLATION_MODEL',
      );

    return this.resolveModel(
      this.validateModelId(
        resolvedModelId,
        'AI_TRANSLATION_MODEL',
      ),
    );
  }

  getReviewModel(
    modelId?: string,
  ) {
    const resolvedModelId =
      modelId ??
      this.configService.get<string>(
        'AI_REVIEW_MODEL',
      );

    return this.resolveModel(
      this.validateModelId(
        resolvedModelId,
        'AI_REVIEW_MODEL',
      ),
    );
  }

  getFallbackModel(
    modelId?: string,
  ) {
    const resolvedModelId =
      modelId ??
      this.configService.get<string>(
        'AI_FALLBACK_MODEL',
      );

    return this.resolveModel(
      this.validateModelId(
        resolvedModelId,
        'AI_FALLBACK_MODEL',
      ),
    );
  }

  private resolveModel(
    modelId: AiModelId,
  ) {
    const separatorIndex =
      modelId.indexOf(':');

    const provider =
      modelId.substring(
        0,
        separatorIndex,
      ) as SupportedAiProvider;

    const model =
      modelId.substring(
        separatorIndex + 1,
      );

    switch (provider) {
      case 'openai':
        return this.openai(model);

      case 'anthropic':
        return this.anthropic(model);

      case 'google':
        return this.google(model);

      default:
        throw new Error(
          `Unsupported AI provider: ${provider}`,
        );
    }
  }

  private validateModelId(
    value: string | undefined,
    configName: string,
  ): AiModelId {
    if (!value) {
      throw new Error(
        `${configName} is not configured.`,
      );
    }

    const separatorIndex =
      value.indexOf(':');

    if (
      separatorIndex <= 0 ||
      separatorIndex ===
        value.length - 1
    ) {
      throw new Error(
        `${configName} must use the format provider:model-id.`,
      );
    }

    const provider =
      value.substring(
        0,
        separatorIndex,
      );

    const supportedProviders:
      SupportedAiProvider[] = [
      'openai',
      'anthropic',
      'google',
    ];

    if (
      !supportedProviders.includes(
        provider as SupportedAiProvider,
      )
    ) {
      throw new Error(
        `Unsupported AI provider "${provider}". Supported providers: ${supportedProviders.join(', ')}.`,
      );
    }

    return value as AiModelId;
  }
}