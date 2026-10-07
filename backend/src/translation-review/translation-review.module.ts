import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';

import { AiTranslationReviewerService } from './ai-translation-reviewer.service.js';

import { TranslationReviewExecutorService } from './translation-review-executor.service.js';

@Module({
  imports: [DatabaseModule],

  providers: [AiTranslationReviewerService, TranslationReviewExecutorService],

  exports: [AiTranslationReviewerService, TranslationReviewExecutorService],
})
export class TranslationReviewModule {}
