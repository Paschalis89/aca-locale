import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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

import {
  TranslationQueueService,
} from './translation-queue.service.js';

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

    private readonly translationQueueService:
      TranslationQueueService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create and enqueue a translation job',

    description:
      'Creates the PostgreSQL translation job and immediately enqueues it for background execution through BullMQ.',
  })
  @ApiCreatedResponse({
    description:
      'Translation job created and queued successfully.',

    type:
      TranslationJobDetailDto,
  })
  async create(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      CreateTranslationJobDto,
  ) {
    const job =
      await this.translationJobsService.create(
        shop.shopDomain,
        body,
      );

    const queue =
      await this.translationQueueService.enqueue(
        job.id,
        shop.shopDomain,
      );

    return {
      ...job,
      queue,
    };
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

  @Get('queue/status')
  @ApiOperation({
    summary:
      'Get translation queue status',
  })
  queueStatus() {
    return this.translationQueueService.status();
  }

  @Get(':id/queue')
  @ApiOperation({
    summary:
      'Get BullMQ status for a translation job',
  })
  @ApiParam({
    name:
      'id',
  })
  queueJobStatus(
    @Param('id')
    jobId:
      string,
  ) {
    return this.translationQueueService.jobStatus(
      jobId,
    );
  }

  @Get(
    'usage/summary',
  )
  @ApiOperation({
    summary:
      'Get translation usage and cost summary',

    description:
      'Returns raw provider usage, estimated configured cost, provider/stage breakdowns and daily/monthly aggregates for the authenticated shop.',
  })
  usageSummary(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Query('days')
    days?:
      string,
  ) {
    return this.translationJobsService.usageSummary(
      shop.shopDomain,
      days,
    );
  }

  @Get(
    'usage/events',
  )
  @ApiOperation({
    summary:
      'List recent translation usage events',

    description:
      'Returns the most recent translation and AI-review provider attempts for the authenticated shop.',
  })
  usageEvents(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Query('limit')
    limit?:
      string,
  ) {
    return this.translationJobsService.usageEvents(
      shop.shopDomain,
      limit,
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
      'Execute a queued translation job immediately',

    description:
      'Development/manual execution endpoint. Production jobs are normally executed by the BullMQ background worker. Duplicate execution is protected by the atomic database claim.',
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
      'Cancels the database lifecycle and removes a waiting BullMQ job when possible. Active work is cancelled cooperatively by the translation executor.',
  })
  async cancel(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    const job =
      await this.translationJobsService.cancel(
        shop.shopDomain,
        jobId,
      );

    const queue =
      await this.translationQueueService.cancel(
        jobId,
      );

    return {
      ...job,
      queue,
    };
  }

  @Post(':id/retry-failed')
  @ApiOperation({
    summary:
      'Retry failed translation items',

    description:
      'Requeues only FAILED items in PostgreSQL and automatically schedules the job again in BullMQ.',
  })
  async retryFailed(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    const job =
      await this.translationJobsService.retryFailed(
        shop.shopDomain,
        jobId,
      );

    const queue =
      await this.translationQueueService.enqueue(
        job.id,
        shop.shopDomain,
      );

    return {
      ...job,
      queue,
    };
  }

  @Post(':id/resume')
  @ApiOperation({
    summary:
      'Resume a cancelled or stale running translation job',

    description:
      'Requeues interrupted GENERATING items in PostgreSQL and schedules the resumed job in BullMQ. RUNNING jobs must be stale for at least five minutes.',
  })
  async resume(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    jobId:
      string,
  ) {
    const job =
      await this.translationJobsService.resume(
        shop.shopDomain,
        jobId,
      );

    const queue =
      await this.translationQueueService.enqueue(
        job.id,
        shop.shopDomain,
      );

    return {
      ...job,
      queue,
    };
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
  async regenerateItem(
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
    const regeneratedJob =
      await this.translationHumanReviewService.regenerate(
        shop.shopDomain,
        jobId,
        itemId,
      );

    const queue =
      await this.translationQueueService.enqueue(
        regeneratedJob.id,
        shop.shopDomain,
      );

    return {
      ...regeneratedJob,
      queue,
    };
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
