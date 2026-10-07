import { Module } from '@nestjs/common';

import { ShopifyAuthModule } from '../shopify-auth/shopify-auth.module.js';

import { ShopsController } from './shops.controller.js';

import { ShopsService } from './shops.service.js';

@Module({
  imports: [ShopifyAuthModule],

  controllers: [ShopsController],

  providers: [ShopsService],

  exports: [ShopsService],
})
export class ShopsModule {}
