import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
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
  TranslationExecutorService,
} from '../translation-engine/translation-executor.service.js';

import {
  TranslationReviewExecutorService,
} from '../translation-review/translation-review-executor.service.js';

import {
  TranslationHumanReviewService,
} from '../translation-human-review/translation-human-review.service.js';

import {
  ApproveTranslationItemDto,
} from '../translation-human-review/dto/approve-translation-item.dto.js';

import {
  RejectTranslationItemDto,
} from '../translation-human-review/dto/reject-translation-item.dto.js';

import {
  TranslationPublicationService,
} from '../translation-publication/translation-publication.service.js';

import {
  CreateTranslationJobDto,
} from './dto/create-translation-job.dto.js';

import {
  TranslationJobDetailDto,
  TranslationJobDto,
} from './dto/translation-job-response.dto.js';

import {
  TranslationJobsService,
} from './translation-jobs.service.js';

@ApiTags(
  'Translation Jobs',
)
@ApiBearerAuth()
@Controller(
  'translations/jobs',
)
@UseGuards(
  ShopifyAuthGuard,
)
export class TranslationJobsController {
  constructor(
    private readonly translationJobsService:
      TranslationJobsService,

    private readonly translationExecutorService:
      TranslationExecutorService,

    private readonly translationReviewExecutorService:
      TranslationReviewExecutorService,

    private readonly translationHumanReviewService:
      TranslationHumanReviewService,

    private readonly translationPublicationService:
      TranslationPublicationService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a translation job',
  })
  @ApiCreatedResponse({
    description:
      'Translation job created successfully.',

    type:
      TranslationJobDetailDto,
  })
  create(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      CreateTranslationJobDto,
  ) {
    return this.translationJobsService.create(
      shop.shopDomain,
      body,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List translation jobs',
  })
  @ApiOkResponse({
    type: [
      TranslationJobDto,
    ],
  })
  findAll(
    @CurrentShop()
    shop:
      ShopifyAuthContext,
  ) {
    return this.translationJobsService.findAll(
      shop.shopDomain,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get translation job details',
  })
  @ApiParam({
    name:
      'id',
  })
  @ApiOkResponse({
    type:
      TranslationJobDetailDto,
  })
  findOne(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    id:
      string,
  ) {
    return this.translationJobsService.findOne(
      shop.shopDomain,
      id,
    );
  }

  @Post(':id/execute')
  @ApiOperation({
    summary:
      'Execute a queued translation job',

    description:
      'Executes pending translation items and deterministic validation. Duplicate execution is protected by an atomic job claim.',
  })
  execute(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    return this.translationExecutorService.execute(
      shop.shopDomain,
      jobId,
    );
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel a queued or running translation job',

    description:
      'Cancellation is cooperative. A translation provider request already in flight may finish, but no additional pending items will be started.',
  })
  cancel(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    return this.translationJobsService.cancel(
      shop.shopDomain,
      jobId,
    );
  }

  @Post(':id/retry-failed')
  @ApiOperation({
    summary:
      'Retry failed translation items',

    description:
      'Requeues only FAILED items in a FAILED or PARTIAL job. Successfully translated items are preserved.',
  })
  retryFailed(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    return this.translationJobsService.retryFailed(
      shop.shopDomain,
      jobId,
    );
  }

  @Post(':id/resume')
  @ApiOperation({
    summary:
      'Resume a cancelled or stale running translation job',

    description:
      'Requeues interrupted GENERATING items. RUNNING jobs can only be recovered after they have been stale for at least five minutes.',
  })
  resume(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    return this.translationJobsService.resume(
      shop.shopDomain,
      jobId,
    );
  }

  @Post(':id/review')
  @ApiOperation({
    summary:
      'Run AI review for a translation job',

    description:
      'Runs the snapshotted AI reviewer without overwriting the generated translation.',
  })
  review(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    return this.translationReviewExecutorService.reviewJob(
      shop.shopDomain,
      jobId,
    );
  }

  @Post(
    ':jobId/items/:itemId/approve',
  )
  @ApiOperation({
    summary:
      'Approve a translation item',

    description:
      'Supports approve-as-is and edit-and-approve. The final value is deterministically validated.',
  })
  approveItem(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('jobId')
    jobId:
      string,

    @Param('itemId')
    itemId:
      string,

    @Body()
    body:
      ApproveTranslationItemDto,
  ) {
    return this.translationHumanReviewService.approve(
      shop.shopDomain,
      jobId,
      itemId,
      body,
    );
  }

  @Post(
    ':jobId/items/:itemId/reject',
  )
  @ApiOperation({
    summary:
      'Reject a translation item',
  })
  rejectItem(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('jobId')
    jobId:
      string,

    @Param('itemId')
    itemId:
      string,

    @Body()
    body:
      RejectTranslationItemDto,
  ) {
    return this.translationHumanReviewService.reject(
      shop.shopDomain,
      jobId,
      itemId,
      body,
    );
  }

  @Post(
    ':jobId/items/:itemId/regenerate',
  )
  @ApiOperation({
    summary:
      'Regenerate a translation item',

    description:
      'Creates a new one-item translation job while preserving the original translation item and its audit history.',
  })
  regenerateItem(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('jobId')
    jobId:
      string,

    @Param('itemId')
    itemId:
      string,
  ) {
    return this.translationHumanReviewService.regenerate(
      shop.shopDomain,
      jobId,
      itemId,
    );
  }

  @Post(
    ':jobId/items/:itemId/publication/prepare',
  )
  @ApiOperation({
    summary:
      'Prepare an approved translation for Shopify publication',

    description:
      'Validates publication eligibility and returns the Shopify resource, key, locale, approved value and source digest required by the React Router Shopify gateway.',
  })
  @ApiParam({
    name:
      'jobId',
  })
  @ApiParam({
    name:
      'itemId',
  })
  @ApiOkResponse({
    description:
      'Translation publication prepared successfully.',
  })
  preparePublication(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('jobId')
    jobId:
      string,

    @Param('itemId')
    itemId:
      string,
  ) {
    return this.translationPublicationService.prepare(
      shop.shopDomain,
      jobId,
      itemId,
    );
  }

  @Post(
    ':jobId/items/:itemId/publication/confirm',
  )
  @ApiOperation({
    summary:
      'Confirm successful Shopify publication',

    description:
      'Marks an approved translation as published only after Shopify translationsRegister succeeds and updates the local TranslationState projection.',
  })
  @ApiParam({
    name:
      'jobId',
  })
  @ApiParam({
    name:
      'itemId',
  })
  @ApiOkResponse({
    description:
      'Translation publication confirmed successfully.',
  })
  confirmPublication(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('jobId')
    jobId:
      string,

    @Param('itemId')
    itemId:
      string,
  ) {
    return this.translationPublicationService.confirmPublished(
      shop.shopDomain,
      jobId,
      itemId,
    );
  }
}
