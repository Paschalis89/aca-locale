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
  ClaimShopifyContentChangeDto,
  FailShopifyContentChangeDto,
  ProcessShopifyContentDeleteDto,
  ProcessShopifyContentUpsertDto,
} from './dto/shopify-content-change.dto.js';

import {
  ShopifyShopEventDto,
} from './dto/shopify-shop-event.dto.js';

import {
  InternalAuthGuard,
} from './internal-auth.guard.js';

import {
  InternalShopifyService,
} from './internal-shopify.service.js';

import {
  InternalTranslationChangeService,
} from './internal-translation-change.service.js';

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

    private readonly translationChanges:
      InternalTranslationChangeService,
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
  @Post('content-change/claim')
  @ApiOperation({
    summary:
      'Claim a verified Shopify translation content change',
  })
  claimContentChange(
    @Body()
    body:
      ClaimShopifyContentChangeDto,
  ) {
    return this.translationChanges.claim(
      body,
    );
  }

  @Post('content-change/process-upsert')
  @ApiOperation({
    summary:
      'Persist one incremental Shopify translation resource scan',
  })
  processContentUpsert(
    @Body()
    body:
      ProcessShopifyContentUpsertDto,
  ) {
    return this.translationChanges.processUpsert(
      body,
    );
  }

  @Post('content-change/process-delete')
  @ApiOperation({
    summary:
      'Tombstone one deleted Shopify translation resource',
  })
  processContentDelete(
    @Body()
    body:
      ProcessShopifyContentDeleteDto,
  ) {
    return this.translationChanges.processDelete(
      body,
    );
  }

  @Post('content-change/fail')
  @ApiOperation({
    summary:
      'Record a failed Shopify translation content change',
  })
  failContentChange(
    @Body()
    body:
      FailShopifyContentChangeDto,
  ) {
    return this.translationChanges.fail(
      body,
    );
  }

}
