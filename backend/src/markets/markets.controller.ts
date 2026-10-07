import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentShop } from '../shopify-auth/current-shop.decorator.js';

import { ShopifyAuthGuard } from '../shopify-auth/shopify-auth.guard.js';

import type { ShopifyAuthContext } from '../shopify-auth/shopify-auth.types.js';

import { SyncShopifyMarketsDto } from './dto/sync-shopify-markets.dto.js';

import { MarketsService } from './markets.service.js';

@ApiTags('Markets')
@ApiBearerAuth()
@Controller('markets')
@UseGuards(ShopifyAuthGuard)
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  @ApiOperation({
    summary: 'List markets for the authenticated shop',
  })
  @ApiOkResponse({
    description: 'Shop markets returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'Shopify ID token is missing or invalid.',
  })
  findAll(
    @CurrentShop()
    shop: ShopifyAuthContext,
  ) {
    return this.marketsService.findForShop(shop.shopDomain);
  }

  @Post('sync/shopify')
  @ApiOperation({
    summary: 'Synchronize Shopify Markets',
  })
  @ApiOkResponse({
    description: 'Shopify Markets synchronized successfully.',
  })
  syncShopify(
    @CurrentShop()
    shop: ShopifyAuthContext,

    @Body()
    body: SyncShopifyMarketsDto,
  ) {
    return this.marketsService.syncShopifyMarkets(
      shop.shopDomain,
      body.markets,
    );
  }
}
