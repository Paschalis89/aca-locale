import {
  Module,
} from '@nestjs/common';

import {
  ShopifyAuthGuard,
} from './shopify-auth.guard.js';

@Module({
  providers: [
    ShopifyAuthGuard,
  ],

  exports: [
    ShopifyAuthGuard,
  ],
})
export class ShopifyAuthModule {}