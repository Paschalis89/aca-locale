import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
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
  SyncTranslationScanDto,
} from './dto/sync-translation-scan.dto.js';

import {
  TranslationScannerService,
} from './translation-scanner.service.js';

@ApiTags(
  'Translation Scanner',
)
@ApiBearerAuth()
@Controller('translations')
@UseGuards(
  ShopifyAuthGuard,
)
export class TranslationScannerController {
  constructor(
    private readonly scannerService:
      TranslationScannerService,
  ) {}

  @Post('scanner/sync')
  @ApiOperation({
    summary:
      'Synchronize a Shopify translation scan',
  })
  @ApiOkResponse({
    description:
      'Translation scan synchronized successfully.',
  })
  sync(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      SyncTranslationScanDto,
  ) {
    return this.scannerService.sync(
      shop.shopDomain,
      body,
    );
  }

  @Get('scanner/summary')
  @ApiOperation({
    summary:
      'Get translation scan summary',
  })
  @ApiQuery({
    name: 'resourceType',
    example: 'PRODUCT',
  })
  @ApiQuery({
    name: 'locale',
    example: 'it',
  })
  summary(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Query('resourceType')
    resourceType: string,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService
      .getSummary(
        shop.shopDomain,
        resourceType,
        locale,
      );
  }

  @Get('resources')
  @ApiOperation({
    summary:
      'List scanned translation resources',
  })
  @ApiQuery({
    name: 'resourceType',
    example: 'PRODUCT',
  })
  @ApiQuery({
    name: 'locale',
    example: 'it',
  })
  resources(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Query('resourceType')
    resourceType: string,

    @Query('locale')
    locale: string,
  ) {
    return this.scannerService
      .findResources(
        shop.shopDomain,
        resourceType,
        locale,
      );
  }
}