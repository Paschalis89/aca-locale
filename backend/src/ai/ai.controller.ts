import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentShop,
} from '../shopify-auth/current-shop.decorator.js';

import {
  ShopifyAuthGuard,
} from '../shopify-auth/shopify-auth.guard.js';

import type {
  ShopifyAuthContext,
} from '../shopify-auth/shopify-auth.types.js';

import {
  AiRegistryService,
} from './ai-registry.service.js';

import {
  AiConfigurationService,
} from './ai-configuration.service.js';

import {
  AiModelCatalogService,
} from './ai-model-catalog.service.js';

import {
  AiProvidersStatusDto,
} from './dto/provider-status.dto.js';

import {
  ProvidersHealthDto,
} from './dto/provider-health.dto.js';

import {
  AiConfigurationDto,
} from './dto/ai-configuration.dto.js';

import {
  UpdateAiConfigurationDto,
} from './dto/update-ai-configuration.dto.js';

import {
  AiModelCatalogDto,
} from './dto/model-catalog.dto.js';

@ApiTags(
  'AI Providers',
)
@ApiBearerAuth()
@Controller('ai')
@UseGuards(
  ShopifyAuthGuard,
)
export class AiController {
  constructor(
    private readonly aiRegistry:
      AiRegistryService,

    private readonly aiConfigurationService:
      AiConfigurationService,

    private readonly aiModelCatalogService:
      AiModelCatalogService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary:
      'Get AI and translation provider availability',
  })
  @ApiOkResponse({
    type:
      AiProvidersStatusDto,
  })
  getProviders() {
    return {
      providers:
        this.aiRegistry
          .getProviderAvailability(),
    };
  }

  @Get('providers/health')
  @ApiOperation({
    summary:
      'Verify configured provider credentials',
  })
  @ApiOkResponse({
    type:
      ProvidersHealthDto,
  })
  async getProviderHealth() {
    return {
      providers:
        await this.aiRegistry
          .checkProviderHealth(),
    };
  }

  @Get('models')
  @ApiOperation({
    summary:
      'Get the available AI model catalog',
    description:
      'Returns models currently available through the configured OpenAI, Anthropic and Google accounts. DeepL does not require a model selection.',
  })
  @ApiOkResponse({
    type:
      AiModelCatalogDto,
  })
  getModels() {
    return this
      .aiModelCatalogService
      .getCatalog();
  }

  @Get('configuration')
  @ApiOperation({
    summary:
      'Get AI configuration for the authenticated shop',
  })
  @ApiOkResponse({
    type:
      AiConfigurationDto,
  })
  getConfiguration(
    @CurrentShop()
    shop:
      ShopifyAuthContext,
  ) {
    return this
      .aiConfigurationService
      .getConfiguration(
        shop.shopDomain,
      );
  }

  @Patch('configuration')
  @ApiOperation({
    summary:
      'Update AI configuration for the authenticated shop',
  })
  @ApiOkResponse({
    type:
      AiConfigurationDto,
  })
  updateConfiguration(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      UpdateAiConfigurationDto,
  ) {
    return this
      .aiConfigurationService
      .updateConfiguration(
        shop.shopDomain,
        body,
      );
  }
}