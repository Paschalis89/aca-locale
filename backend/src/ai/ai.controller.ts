import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentShop } from '../shopify-auth/current-shop.decorator.js';

import { ShopifyAuthGuard } from '../shopify-auth/shopify-auth.guard.js';

import type { ShopifyAuthContext } from '../shopify-auth/shopify-auth.types.js';

import { UsagePricingService } from './usage-pricing.service.js';
import { AiBudgetService } from './ai-budget.service.js';

import { AiRegistryService } from './ai-registry.service.js';

import { AiConfigurationService } from './ai-configuration.service.js';

import { AiModelCatalogService } from './ai-model-catalog.service.js';

import { AiProvidersStatusDto } from './dto/provider-status.dto.js';

import { ProvidersHealthDto } from './dto/provider-health.dto.js';

import { AiConfigurationDto } from './dto/ai-configuration.dto.js';

import { UpdateAiConfigurationDto } from './dto/update-ai-configuration.dto.js';

import { AiModelCatalogDto } from './dto/model-catalog.dto.js';

@ApiTags('AI Providers')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(ShopifyAuthGuard)
export class AiController {
  constructor(
    private readonly aiRegistry: AiRegistryService,

    private readonly aiConfigurationService: AiConfigurationService,

    private readonly aiModelCatalogService: AiModelCatalogService,
    private readonly usagePricing: UsagePricingService,
    private readonly aiBudget: AiBudgetService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Get AI and translation provider availability',
  })
  @ApiOkResponse({
    type: AiProvidersStatusDto,
  })
  getProviders() {
    return {
      providers: this.aiRegistry.getProviderAvailability(),
    };
  }

  @Get('providers/health')
  @ApiOperation({
    summary: 'Verify configured provider credentials',
  })
  @ApiOkResponse({
    type: ProvidersHealthDto,
  })
  async getProviderHealth() {
    return {
      providers: await this.aiRegistry.checkProviderHealth(),
    };
  }

  @Get('models')
  @ApiOperation({
    summary: 'Get the available AI model catalog',
    description:
      'Returns models currently available through the configured OpenAI, Anthropic and Google accounts. DeepL does not require a model selection.',
  })
  @ApiOkResponse({
    type: AiModelCatalogDto,
  })
  getModels() {
    return this.aiModelCatalogService.getCatalog();
  }

  @Get('usage-pricing')
  @ApiOperation({ summary: 'Get shop pricing and recent version history' })
  getUsagePricing(@CurrentShop() shop: ShopifyAuthContext) {
    return this.usagePricing.get(shop.shopDomain);
  }

  @Post('usage-pricing/preview')
  @ApiOperation({ summary: 'Preview pricing against recorded usage, without saving or changing history' })
  previewUsagePricing(@CurrentShop() shop: ShopifyAuthContext, @Body() body: { rules?: unknown }) {
    return this.usagePricing.preview(shop.shopDomain, body);
  }

  @Patch('usage-pricing')
  @ApiOperation({ summary: 'Save versioned, per-shop estimated provider prices' })
  setUsagePricing(@CurrentShop() shop: ShopifyAuthContext, @Body() body: { rules?: unknown; expectedVersion?: unknown }) {
    return this.usagePricing.update(shop.shopDomain, body);
  }

  @Get('budget')
  @ApiOperation({ summary: 'Monthly advisory AI budget, usage coverage and provider errors' })
  getAiBudget(@CurrentShop() shop: ShopifyAuthContext) {
    return this.aiBudget.get(shop.shopDomain);
  }

  @Patch('budget')
  @ApiOperation({ summary: 'Set monthly advisory budget without stopping translations' })
  updateAiBudget(@CurrentShop() shop: ShopifyAuthContext, @Body() body: { monthlyBudgetUsd?: unknown; expectedVersion?: unknown }) {
    return this.aiBudget.update(shop.shopDomain, body);
  }

  @Get('configuration')
  @ApiOperation({
    summary: 'Get AI configuration for the authenticated shop',
  })
  @ApiOkResponse({
    type: AiConfigurationDto,
  })
  getConfiguration(
    @CurrentShop()
    shop: ShopifyAuthContext,
  ) {
    return this.aiConfigurationService.getConfiguration(shop.shopDomain);
  }

  @Patch('configuration')
  @ApiOperation({
    summary: 'Update AI configuration for the authenticated shop',
  })
  @ApiOkResponse({
    type: AiConfigurationDto,
  })
  updateConfiguration(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Body()
    body: UpdateAiConfigurationDto,
  ) {
    return this.aiConfigurationService.updateConfiguration(
      shop.shopDomain,
      body,
    );
  }
}
