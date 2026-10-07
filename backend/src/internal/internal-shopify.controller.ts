import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  ShopifyShopEventDto,
} from './dto/shopify-shop-event.dto.js';

import {
  InternalAuthGuard,
} from './internal-auth.guard.js';

import {
  InternalShopifyService,
} from './internal-shopify.service.js';

@ApiTags(
  'Internal',
)
@Controller(
  'internal/shopify',
)
@UseGuards(
  InternalAuthGuard,
)
export class InternalShopifyController {
  constructor(
    private readonly service:
      InternalShopifyService,
  ) {}

  @Post('app-uninstalled')
  @ApiOperation({
    summary:
      'Handle verified Shopify app uninstall',
  })
  appUninstalled(
    @Body()
    body:
      ShopifyShopEventDto,
  ) {
    return this.service.appUninstalled(
      body.shopifyDomain,
    );
  }

  @Post('shop-redact')
  @ApiOperation({
    summary:
      'Permanently redact all ACA Locale shop data',
  })
  shopRedact(
    @Body()
    body:
      ShopifyShopEventDto,
  ) {
    return this.service.redactShop(
      body.shopifyDomain,
    );
  }
}
