import { Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

type ProviderName = 'openai' | 'anthropic' | 'google' | 'deepl';

type CatalogStatus = 'OK' | 'ERROR' | 'NOT_CONFIGURED';

type ModelCatalogItem = {
  id: string;
  name: string;
  selectable: boolean;
  createdAt?: string | null;
};

type ProviderCatalog = {
  provider: ProviderName;

  status: CatalogStatus;

  configured: boolean;

  requiresModel: boolean;

  message: string;

  modelCount: number;

  models: ModelCatalogItem[];
};

type ModelCatalog = {
  generatedAt: string;

  providers: ProviderCatalog[];
};

@Injectable()
export class AiModelCatalogService {
  private readonly cacheTtlMs = 5 * 60 * 1000;

  private cache:
    | {
        expiresAt: number;

        value: ModelCatalog;
      }
    | undefined;

  constructor(private readonly configService: ConfigService) {}

  async getCatalog(): Promise<ModelCatalog> {
    const now = Date.now();

    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    /*
     * One unavailable provider must not
     * prevent the other catalogs from
     * being returned.
     */
    const providers = await Promise.all([
      this.getOpenAiCatalog(),
      this.getAnthropicCatalog(),
      this.getGoogleCatalog(),
      this.getDeepLCatalog(),
    ]);

    const value: ModelCatalog = {
      generatedAt: new Date().toISOString(),

      providers,
    };

    this.cache = {
      expiresAt: now + this.cacheTtlMs,

      value,
    };

    return value;
  }

  private async getOpenAiCatalog(): Promise<ProviderCatalog> {
    const apiKey = this.getOptionalConfig('OPENAI_API_KEY');

    if (!apiKey) {
      return this.notConfigured('openai', true);
    }

    try {
      const response = await this.fetchWithTimeout(
        'https://api.openai.com/v1/models',
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          created?: number;
        }>;

        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        return this.errorCatalog(
          'openai',
          true,
          data.error?.message ?? `HTTP ${response.status}`,
        );
      }

      const models = (data.data ?? [])
        .map((model): ModelCatalogItem => ({
          id: model.id,

          name: model.id,

          selectable: this.isOpenAiSelectable(model.id),

          createdAt: model.created
            ? new Date(model.created * 1000).toISOString()
            : null,
        }))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

      return {
        provider: 'openai',

        status: 'OK',

        configured: true,

        requiresModel: true,

        message: 'OpenAI model catalog loaded.',

        modelCount: models.length,

        models,
      };
    } catch (error) {
      return this.errorCatalog('openai', true, this.errorMessage(error));
    }
  }

  private async getAnthropicCatalog(): Promise<ProviderCatalog> {
    const apiKey = this.getOptionalConfig('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return this.notConfigured('anthropic', true);
    }

    try {
      const response = await this.fetchWithTimeout(
        'https://api.anthropic.com/v1/models?limit=100',
        {
          headers: {
            'x-api-key': apiKey,

            'anthropic-version': '2023-06-01',
          },
        },
      );

      const data = (await response.json()) as {
        data?: Array<{
          id: string;

          display_name?: string;

          created_at?: string;
        }>;

        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        return this.errorCatalog(
          'anthropic',
          true,
          data.error?.message ?? `HTTP ${response.status}`,
        );
      }

      const models = (data.data ?? [])
        .map((model): ModelCatalogItem => ({
          id: model.id,

          name: model.display_name ?? model.id,

          selectable: model.id.toLowerCase().startsWith('claude-'),

          createdAt: model.created_at ?? null,
        }))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

      return {
        provider: 'anthropic',

        status: 'OK',

        configured: true,

        requiresModel: true,

        message: 'Anthropic model catalog loaded.',

        modelCount: models.length,

        models,
      };
    } catch (error) {
      return this.errorCatalog('anthropic', true, this.errorMessage(error));
    }
  }

  private async getGoogleCatalog(): Promise<ProviderCatalog> {
    const apiKey = this.getOptionalConfig('GOOGLE_GENERATIVE_AI_API_KEY');

    if (!apiKey) {
      return this.notConfigured('google', true);
    }

    try {
      const models: ModelCatalogItem[] = [];

      let pageToken: string | undefined;

      do {
        const url = new URL(
          'https://generativelanguage.googleapis.com/v1beta/models',
        );

        url.searchParams.set('pageSize', '100');

        url.searchParams.set('key', apiKey);

        if (pageToken) {
          url.searchParams.set('pageToken', pageToken);
        }

        const response = await this.fetchWithTimeout(url.toString());

        const data = (await response.json()) as {
          models?: Array<{
            name: string;

            displayName?: string;

            supportedGenerationMethods?: string[];
          }>;

          nextPageToken?: string;

          error?: {
            message?: string;
          };
        };

        if (!response.ok) {
          return this.errorCatalog(
            'google',
            true,
            data.error?.message ?? `HTTP ${response.status}`,
          );
        }

        for (const model of data.models ?? []) {
          const id = model.name.replace(/^models\//, '');

          models.push({
            id,

            name: model.displayName ?? id,

            selectable: this.isGoogleSelectable(
              id,
              model.supportedGenerationMethods ?? [],
            ),
          });
        }

        pageToken = data.nextPageToken;
      } while (pageToken);

      models.sort((a, b) => a.name.localeCompare(b.name));

      return {
        provider: 'google',

        status: 'OK',

        configured: true,

        requiresModel: true,

        message: 'Google Gemini model catalog loaded.',

        modelCount: models.length,

        models,
      };
    } catch (error) {
      return this.errorCatalog('google', true, this.errorMessage(error));
    }
  }

  private getDeepLCatalog(): Promise<ProviderCatalog> {
    const configured = Boolean(this.getOptionalConfig('DEEPL_API_KEY'));

    if (!configured) {
      return Promise.resolve(this.notConfigured('deepl', false));
    }

    return Promise.resolve({
      provider: 'deepl',

      status: 'OK',

      configured: true,

      requiresModel: false,

      message: 'DeepL does not require a model selection.',

      modelCount: 0,

      models: [],
    });
  }

  /*
   * OpenAI's /models endpoint exposes
   * model IDs but not a capability map.
   *
   * Therefore ACA Locale keeps all
   * returned models in the catalog and
   * marks likely text-generation models
   * as selectable.
   */
  private isOpenAiSelectable(modelId: string) {
    const id = modelId.toLowerCase();

    const excluded = [
      'embedding',
      'moderation',
      'image',
      'dall-e',
      'tts',
      'transcribe',
      'whisper',
      'realtime',
      'live',
      'audio',
      'search',
      'codex',
      'computer-use',
      'deep-research',
      'cyber',
      'sora',
    ];

    if (excluded.some((value) => id.includes(value))) {
      return false;
    }

    return id.startsWith('gpt-') || /^o\d/.test(id);
  }

  private isGoogleSelectable(
    modelId: string,

    supportedMethods: string[],
  ) {
    if (!supportedMethods.includes('generateContent')) {
      return false;
    }

    const id = modelId.toLowerCase();

    const excluded = [
      'image',
      'tts',
      'live',
      'transcribe',
      'embedding',
      'robotics',
      'veo',
      'lyria',
      'deep-research',
      'antigravity',
      'computer-use',
      'nano-banana',
    ];

    return !excluded.some((value) => id.includes(value));
  }

  private notConfigured(
    provider: ProviderName,

    requiresModel: boolean,
  ): ProviderCatalog {
    return {
      provider,

      status: 'NOT_CONFIGURED',

      configured: false,

      requiresModel,

      message: 'Provider credentials are not configured.',

      modelCount: 0,

      models: [],
    };
  }

  private errorCatalog(
    provider: ProviderName,

    requiresModel: boolean,

    message: string,
  ): ProviderCatalog {
    return {
      provider,

      status: 'ERROR',

      configured: true,

      requiresModel,

      message,

      modelCount: 0,

      models: [],
    };
  }

  private async fetchWithTimeout(url: string, init?: RequestInit) {
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      return await fetch(url, {
        ...init,

        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private getOptionalConfig(name: string) {
    const value = this.configService.get<string>(name)?.trim();

    return value ? value : undefined;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
