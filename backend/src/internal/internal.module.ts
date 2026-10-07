import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  InternalAuthGuard,
} from './internal-auth.guard.js';

import {
  InternalShopifyController,
} from './internal-shopify.controller.js';

import {
  InternalShopifyService,
} from './internal-shopify.service.js';

@Module({
  imports: [
    DatabaseModule,
  ],

  controllers: [
    InternalShopifyController,
  ],

  providers: [
    InternalAuthGuard,
    InternalShopifyService,
  ],
})
export class InternalModule {}
