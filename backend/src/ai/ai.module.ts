import {
  Global,
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  ShopifyAuthModule,
} from '../shopify-auth/shopify-auth.module.js';

import {
  AiRegistryService,
} from './ai-registry.service.js';

import {
  AiConfigurationService,
} from './ai-configuration.service.js';

import {
  AiModelCatalogService,
} from './ai-model-catalog.service.js';

import {
  AiController,
} from './ai.controller.js';

@Global()
@Module({
  imports: [
    DatabaseModule,
    ShopifyAuthModule,
  ],

  controllers: [
    AiController,
  ],

  providers: [
    AiRegistryService,
    AiConfigurationService,
    AiModelCatalogService,
  ],

  exports: [
    AiRegistryService,
    AiConfigurationService,
    AiModelCatalogService,
  ],
})
export class AiModule {}