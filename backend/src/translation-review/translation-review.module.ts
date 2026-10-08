import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';

import { GlossaryModule } from '../glossary/glossary.module.js';

import { AiTranslationReviewerService } from '../translation-review/ai-translation-reviewer.service.js';

import { TranslationReviewExecutorService } from './translation-review-executor.service.js';

@Module({
  imports: [DatabaseModule, GlossaryModule],

  providers: [AiTranslationReviewerService, TranslationReviewExecutorService],

  exports: [AiTranslationReviewerService, TranslationReviewExecutorService],
})
export class TranslationReviewModule {}
