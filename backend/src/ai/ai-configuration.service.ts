import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import {
  AiRegistryService,
} from './ai-registry.service.js';

import type {
  UpdateAiConfigurationDto,
} from './dto/update-ai-configuration.dto.js';

type TranslationProvider =
  | 'OPENAI'
  | 'ANTHROPIC'
  | 'GOOGLE'
  | 'DEEPL';

@Injectable()
export class AiConfigurationService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly aiRegistry:
      AiRegistryService,
  ) {}

  async getConfiguration(
    shopifyDomain: string,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },

        select: {
          id:
            true,

          aiConfiguration:
            true,
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    if (
      shop.aiConfiguration
    ) {
      return shop.aiConfiguration;
    }

    /*
     * Defensive fallback.
     *
     * Normally the shop bootstrap already
     * creates AiConfiguration.
     */
    return this.prisma.aiConfiguration.create({
      data: {
        shopId:
          shop.id,
      },
    });
  }

  async updateConfiguration(
    shopifyDomain: string,
    body: UpdateAiConfigurationDto,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },

        select: {
          id:
            true,

          aiConfiguration:
            true,
        },
      });

    if (!shop) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    /*
     * Make sure a merchant cannot select
     * a provider whose server-side
     * credentials are unavailable.
     */
    this.validateProvider(
      body.translationProvider,
    );

    this.validateProvider(
      body.reviewProvider,
    );

    this.validateProvider(
      body.fallbackProvider,
    );

    /*
     * DeepL does not have an LLM model ID.
     *
     * If DeepL is selected, any old model
     * stored from another provider must be
     * removed.
     */
    const translationModel =
      body.translationProvider ===
      'DEEPL'
        ? null
        : body.translationModel;

    const fallbackModel =
      body.fallbackProvider ===
      'DEEPL'
        ? null
        : body.fallbackModel;

    return this.prisma.aiConfiguration.upsert({
      where: {
        shopId:
          shop.id,
      },

      create: {
        shopId:
          shop.id,

        translationProvider:
          body.translationProvider ??
          'OPENAI',

        translationModel:
          translationModel ??
          null,

        reviewProvider:
          body.reviewProvider ??
          'OPENAI',

        reviewModel:
          body.reviewModel ??
          null,

        fallbackProvider:
          body.fallbackProvider ??
          'OPENAI',

        fallbackModel:
          fallbackModel ??
          null,
      },

      update: {
        ...(body.translationProvider !==
        undefined
          ? {
              translationProvider:
                body.translationProvider,
            }
          : {}),

        ...(body.translationModel !==
          undefined ||
        body.translationProvider ===
          'DEEPL'
          ? {
              translationModel:
                translationModel ??
                null,
            }
          : {}),

        ...(body.reviewProvider !==
        undefined
          ? {
              reviewProvider:
                body.reviewProvider,
            }
          : {}),

        ...(body.reviewModel !==
        undefined
          ? {
              reviewModel:
                body.reviewModel ??
                null,
            }
          : {}),

        ...(body.fallbackProvider !==
        undefined
          ? {
              fallbackProvider:
                body.fallbackProvider,
            }
          : {}),

        ...(body.fallbackModel !==
          undefined ||
        body.fallbackProvider ===
          'DEEPL'
          ? {
              fallbackModel:
                fallbackModel ??
                null,
            }
          : {}),
      },
    });
  }

  private validateProvider(
    provider:
      TranslationProvider |
      undefined,
  ) {
    if (!provider) {
      return;
    }

    const normalized =
      provider.toLowerCase() as
        | 'openai'
        | 'anthropic'
        | 'google'
        | 'deepl';

    if (
      !this.aiRegistry
        .isProviderConfigured(
          normalized,
        )
    ) {
      throw new BadRequestException(
        `Provider "${provider}" is not configured on the ACA Locale backend.`,
      );
    }
  }
}