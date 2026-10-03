import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
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
  ShopsService,
} from './shops.service.js';

@ApiTags('Shops')
@ApiBearerAuth()
@Controller('shops')
export class ShopsController {
  constructor(
    private readonly shopsService:
      ShopsService,
  ) {}

  @Get('current')
  @UseGuards(
    ShopifyAuthGuard,
  )
  @ApiOperation({
    summary:
      'Get current authenticated shop',
  })
  @ApiOkResponse({
    description:
      'Returns the tenant identified by the Shopify ID token.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Shopify ID token is missing, invalid or expired.',
  })
  getCurrentShop(
    @CurrentShop()
    context:
      ShopifyAuthContext,
  ) {
    return this.shopsService
      .ensureShop(
        context.shopDomain,
      );
  }
}