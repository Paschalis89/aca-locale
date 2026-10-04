import {
  Module,
} from '@nestjs/common';

import {
  ShopifyAuthModule,
} from '../shopify-auth/shopify-auth.module.js';

import {
  LanguagesController,
} from './languages.controller.js';

import {
  LanguagesService,
} from './languages.service.js';

@Module({
  imports: [
    ShopifyAuthModule,
  ],

  controllers: [
    LanguagesController,
  ],

  providers: [
    LanguagesService,
  ],

  exports: [
    LanguagesService,
  ],
})
export class LanguagesModule {}