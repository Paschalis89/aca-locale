import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentShop } from '../shopify-auth/current-shop.decorator.js';

import { ShopifyAuthGuard } from '../shopify-auth/shopify-auth.guard.js';

import type { ShopifyAuthContext } from '../shopify-auth/shopify-auth.types.js';

import { SyncTranslationScanDto } from './dto/sync-translation-scan.dto.js';

import {
  TranslationResourceTypesOverviewDto,
  TranslationScannerOverviewDto,
} from './dto/translation-scanner-overview.dto.js';

import { TranslationScannerService } from './translation-scanner.service.js';

@ApiTags('Translation Scanner')
@ApiBearerAuth()
@Controller('translations')
@UseGuards(ShopifyAuthGuard)
export class TranslationScannerController {
  constructor(private readonly scannerService: TranslationScannerService) {}

  @Post('scanner/sync')
  @ApiOperation({
    summary: 'Synchronize a Shopify translation scan',
  })
  @ApiOkResponse({
    description: 'Translation scan synchronized successfully.',
  })
  sync(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Body()
    body: SyncTranslationScanDto,
  ) {
    return this.scannerService.sync(shop.shopDomain, body);
  }

  @Get('scanner/summary')
  @ApiOperation({
    summary: 'Get translation scan summary for one resource type',
  })
  @ApiQuery({
    name: 'resourceType',
    required: true,
    example: 'PRODUCT',
  })
  @ApiQuery({
    name: 'locale',
    required: true,
    example: 'it',
  })
  @ApiOkResponse({
    description: 'Translation scan summary returned successfully.',
  })
  summary(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Query('resourceType')
    resourceType: string,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService.getSummary(
      shop.shopDomain,
      resourceType,
      locale,
    );
  }

  @Get('scanner/overview')
  @ApiOperation({
    summary: 'Get the global translation scanner overview',
    description:
      'Returns the translation status grouped into content, custom data, commerce, theme and system resources.',
  })
  @ApiQuery({
    name: 'locale',
    required: true,
    example: 'it',
  })
  @ApiOkResponse({
    description: 'Global translation scanner overview returned successfully.',
    type: TranslationScannerOverviewDto,
  })
  overview(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService.getOverview(shop.shopDomain, locale);
  }

  @Get('scanner/resource-types')
  @ApiOperation({
    summary: 'Get translation scanner statistics by Shopify resource type',
    description:
      'Returns scanner statistics for every supported Shopify translatable resource type, including resource types with zero content.',
  })
  @ApiQuery({
    name: 'locale',
    required: true,
    example: 'it',
  })
  @ApiOkResponse({
    description: 'Resource type translation statistics returned successfully.',
    type: TranslationResourceTypesOverviewDto,
  })
  resourceTypesOverview(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService.getResourceTypesOverview(
      shop.shopDomain,
      locale,
    );
  }

  @Get('resources')
  @ApiOperation({
    summary: 'List scanned translation resources',
  })
  @ApiQuery({
    name: 'resourceType',
    required: true,
    example: 'PRODUCT',
  })
  @ApiQuery({
    name: 'locale',
    required: true,
    example: 'it',
  })
  @ApiOkResponse({
    description: 'Scanned translation resources returned successfully.',
  })
  resources(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Query('resourceType')
    resourceType: string,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService.findResources(
      shop.shopDomain,
      resourceType,
      locale,
    );
  }
}
