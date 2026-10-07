import {
  Injectable,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

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

export type SupportedAiProvider =
  | 'openai'
  | 'anthropic'
  | 'google';

export type SupportedTranslationProvider =
  | SupportedAiProvider
  | 'deepl';

type AiModelId =
  `${SupportedAiProvider}:${string}`;

export type ProviderAvailability = {
  provider:
    SupportedTranslationProvider;

  configured:
    boolean;

  supportsTranslation:
    boolean;

  supportsReview:
    boolean;

  requiresModel:
    boolean;
};

export type DeepLConfiguration = {
  apiKey:
    string;

  apiUrl:
    string;
};

export type ProviderHealthStatus =
  | 'OK'
  | 'ERROR'
  | 'NOT_CONFIGURED';

export type ProviderHealth = {
  provider:
    SupportedTranslationProvider;

  status:
    ProviderHealthStatus;

  latencyMs:
    number | null;

  message:
    string;

  availableModels?:
    number;

  usage?: {
    characterCount:
      number;

    characterLimit:
      number;
  };
};

@Injectable()
export class AiRegistryService {
  private readonly openai:
    OpenAIProvider;

  private readonly anthropic:
    AnthropicProvider;

  private readonly google:
    GoogleGenerativeAIProvider;

  constructor(
    private readonly configService:
      ConfigService,
  ) {
    const openAiApiKey =
      this.getOptionalConfig(
        'OPENAI_API_KEY',
      );

    const anthropicApiKey =
      this.getOptionalConfig(
        'ANTHROPIC_API_KEY',
      );

    const googleApiKey =
      this.getOptionalConfig(
        'GOOGLE_GENERATIVE_AI_API_KEY',
      );

    this.openai =
      createOpenAI(
        openAiApiKey
          ? {
              apiKey:
                openAiApiKey,
            }
          : {},
      );

    this.anthropic =
      createAnthropic(
        anthropicApiKey
          ? {
              apiKey:
                anthropicApiKey,
            }
          : {},
      );

    this.google =
      createGoogleGenerativeAI(
        googleApiKey
          ? {
              apiKey:
                googleApiKey,
            }
          : {},
      );
  }

  getTranslationModel(
    modelId?: string,
  ) {
    const resolvedModelId =
      modelId ??
      this.getOptionalConfig(
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
      this.getOptionalConfig(
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
      this.getOptionalConfig(
        'AI_FALLBACK_MODEL',
      );

    return this.resolveModel(
      this.validateModelId(
        resolvedModelId,
        'AI_FALLBACK_MODEL',
      ),
    );
  }

  getModel(
    modelId: string,
  ) {
    return this.resolveModel(
      this.validateModelId(
        modelId,
        'modelId',
      ),
    );
  }

  getDeepLConfiguration():
    DeepLConfiguration {
    const apiKey =
      this.requireConfig(
        'DEEPL_API_KEY',
      );

    const apiUrl =
      (
        this.getOptionalConfig(
          'DEEPL_API_URL',
        ) ??
        'https://api.deepl.com'
      ).replace(
        /\/+$/,
        '',
      );

    return {
      apiKey,
      apiUrl,
    };
  }

  getProviderAvailability():
    ProviderAvailability[] {
    return [
      {
        provider:
          'openai',

        configured:
          this.hasConfig(
            'OPENAI_API_KEY',
          ),

        supportsTranslation:
          true,

        supportsReview:
          true,

        requiresModel:
          true,
      },

      {
        provider:
          'anthropic',

        configured:
          this.hasConfig(
            'ANTHROPIC_API_KEY',
          ),

        supportsTranslation:
          true,

        supportsReview:
          true,

        requiresModel:
          true,
      },

      {
        provider:
          'google',

        configured:
          this.hasConfig(
            'GOOGLE_GENERATIVE_AI_API_KEY',
          ),

        supportsTranslation:
          true,

        supportsReview:
          true,

        requiresModel:
          true,
      },

      {
        provider:
          'deepl',

        configured:
          this.hasConfig(
            'DEEPL_API_KEY',
          ),

        supportsTranslation:
          true,

        supportsReview:
          false,

        requiresModel:
          false,
      },
    ];
  }

  isProviderConfigured(
    provider:
      SupportedTranslationProvider,
  ) {
    return (
      this.getProviderAvailability()
        .find(
          (item) =>
            item.provider ===
            provider,
        )
        ?.configured ??
      false
    );
  }

  async checkProviderHealth():
    Promise<ProviderHealth[]> {
    const results =
      await Promise.all([
        this.checkOpenAiHealth(),
        this.checkAnthropicHealth(),
        this.checkGoogleHealth(),
        this.checkDeepLHealth(),
      ]);

    return results;
  }

  private async checkOpenAiHealth():
    Promise<ProviderHealth> {
    const apiKey =
      this.getOptionalConfig(
        'OPENAI_API_KEY',
      );

    if (!apiKey) {
      return this.notConfigured(
        'openai',
      );
    }

    const startedAt =
      Date.now();

    try {
      const response =
        await this.fetchWithTimeout(
          'https://api.openai.com/v1/models',
          {
            headers: {
              Authorization:
                `Bearer ${apiKey}`,
            },
          },
        );

      const data =
        await response.json() as {
          data?: unknown[];
          error?: {
            message?: string;
          };
        };

      if (!response.ok) {
        return this.failedHealth(
          'openai',
          startedAt,
          data.error?.message ??
            `HTTP ${response.status}`,
        );
      }

      return {
        provider:
          'openai',

        status:
          'OK',

        latencyMs:
          Date.now() -
          startedAt,

        message:
          'OpenAI API credentials are valid.',

        availableModels:
          data.data?.length ??
          0,
      };
    } catch (error) {
      return this.failedHealth(
        'openai',
        startedAt,
        this.errorMessage(
          error,
        ),
      );
    }
  }

  private async checkAnthropicHealth():
    Promise<ProviderHealth> {
    const apiKey =
      this.getOptionalConfig(
        'ANTHROPIC_API_KEY',
      );

    if (!apiKey) {
      return this.notConfigured(
        'anthropic',
      );
    }

    const startedAt =
      Date.now();

    try {
      const response =
        await this.fetchWithTimeout(
          'https://api.anthropic.com/v1/models?limit=1',
          {
            headers: {
              'x-api-key':
                apiKey,

              'anthropic-version':
                '2023-06-01',
            },
          },
        );

      const data =
        await response.json() as {
          data?: unknown[];
          error?: {
            message?: string;
          };
        };

      if (!response.ok) {
        return this.failedHealth(
          'anthropic',
          startedAt,
          data.error?.message ??
            `HTTP ${response.status}`,
        );
      }

      return {
        provider:
          'anthropic',

        status:
          'OK',

        latencyMs:
          Date.now() -
          startedAt,

        message:
          'Anthropic API credentials are valid.',

        availableModels:
          data.data?.length ??
          0,
      };
    } catch (error) {
      return this.failedHealth(
        'anthropic',
        startedAt,
        this.errorMessage(
          error,
        ),
      );
    }
  }

  private async checkGoogleHealth():
    Promise<ProviderHealth> {
    const apiKey =
      this.getOptionalConfig(
        'GOOGLE_GENERATIVE_AI_API_KEY',
      );

    if (!apiKey) {
      return this.notConfigured(
        'google',
      );
    }

    const startedAt =
      Date.now();

    try {
      const response =
        await this.fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(
            apiKey,
          )}`,
        );

      const data =
        await response.json() as {
          models?: unknown[];
          error?: {
            message?: string;
          };
        };

      if (!response.ok) {
        return this.failedHealth(
          'google',
          startedAt,
          data.error?.message ??
            `HTTP ${response.status}`,
        );
      }

      return {
        provider:
          'google',

        status:
          'OK',

        latencyMs:
          Date.now() -
          startedAt,

        message:
          'Google Gemini API credentials are valid.',

        availableModels:
          data.models?.length ??
          0,
      };
    } catch (error) {
      return this.failedHealth(
        'google',
        startedAt,
        this.errorMessage(
          error,
        ),
      );
    }
  }

  private async checkDeepLHealth():
    Promise<ProviderHealth> {
    const apiKey =
      this.getOptionalConfig(
        'DEEPL_API_KEY',
      );

    if (!apiKey) {
      return this.notConfigured(
        'deepl',
      );
    }

    const startedAt =
      Date.now();

    try {
      const {
        apiUrl,
      } =
        this.getDeepLConfiguration();

      const response =
        await this.fetchWithTimeout(
          `${apiUrl}/v2/usage`,
          {
            headers: {
              Authorization:
                `DeepL-Auth-Key ${apiKey}`,
            },
          },
        );

      const data =
        await response.json() as {
          character_count?: number;
          character_limit?: number;
          message?: string;
        };

      if (!response.ok) {
        return this.failedHealth(
          'deepl',
          startedAt,
          data.message ??
            `HTTP ${response.status}`,
        );
      }

      return {
        provider:
          'deepl',

        status:
          'OK',

        latencyMs:
          Date.now() -
          startedAt,

        message:
          'DeepL API credentials are valid.',

        usage: {
          characterCount:
            data.character_count ??
            0,

          characterLimit:
            data.character_limit ??
            0,
        },
      };
    } catch (error) {
      return this.failedHealth(
        'deepl',
        startedAt,
        this.errorMessage(
          error,
        ),
      );
    }
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        10_000,
      );

    try {
      return await fetch(
        url,
        {
          ...init,

          signal:
            controller.signal,
        },
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }

  private notConfigured(
    provider:
      SupportedTranslationProvider,
  ): ProviderHealth {
    return {
      provider,

      status:
        'NOT_CONFIGURED',

      latencyMs:
        null,

      message:
        'Provider credentials are not configured.',
    };
  }

  private failedHealth(
    provider:
      SupportedTranslationProvider,

    startedAt:
      number,

    message:
      string,
  ): ProviderHealth {
    return {
      provider,

      status:
        'ERROR',

      latencyMs:
        Date.now() -
        startedAt,

      message,
    };
  }

  private errorMessage(
    error: unknown,
  ) {
    if (
      error instanceof Error
    ) {
      return error.message;
    }

    return String(
      error,
    );
  }

  private resolveModel(
    modelId:
      AiModelId,
  ) {
    const separatorIndex =
      modelId.indexOf(
        ':',
      );

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
        return this.openai(
          model,
        );

      case 'anthropic':
        return this.anthropic(
          model,
        );

      case 'google':
        return this.google(
          model,
        );
    }
  }

  private validateModelId(
    value:
      string |
      undefined,

    configName:
      string,
  ): AiModelId {
    if (!value) {
      throw new Error(
        `${configName} is not configured.`,
      );
    }

    const separatorIndex =
      value.indexOf(
        ':',
      );

    if (
      separatorIndex <=
        0 ||
      separatorIndex ===
        value.length -
          1
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

    return value as
      AiModelId;
  }

  private hasConfig(
    name: string,
  ) {
    return Boolean(
      this.getOptionalConfig(
        name,
      ),
    );
  }

  private getOptionalConfig(
    name: string,
  ) {
    const value =
      this.configService
        .get<string>(
          name,
        )
        ?.trim();

    return value
      ? value
      : undefined;
  }

  private requireConfig(
    name: string,
  ) {
    const value =
      this.getOptionalConfig(
        name,
      );

    if (!value) {
      throw new Error(
        `${name} is not configured.`,
      );
    }

    return value;
  }
}