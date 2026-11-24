import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../shopify-auth/current-shop.decorator.js';
import { ShopifyAuthGuard } from '../shopify-auth/shopify-auth.guard.js';
import type { ShopifyAuthContext } from '../shopify-auth/shopify-auth.types.js';
import { OperationsService } from './operations.service.js';

@ApiTags('Operations')
@ApiBearerAuth()
@Controller('operations')
@UseGuards(ShopifyAuthGuard)
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'Read-only shop-scoped operational snapshot' })
  snapshot(@CurrentShop() shop: ShopifyAuthContext) {
    return this.service.snapshot(shop.shopDomain);
  }
}
