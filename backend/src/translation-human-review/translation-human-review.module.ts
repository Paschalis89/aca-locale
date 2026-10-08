import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';

import { GlossaryModule } from '../glossary/glossary.module.js';

import { TranslationValidationModule } from '../translation-validation/translation-validation.module.js';

import { TranslationHumanReviewService } from './translation-human-review.service.js';

@Module({
  imports: [DatabaseModule, GlossaryModule, TranslationValidationModule],

  providers: [TranslationHumanReviewService],

  exports: [TranslationHumanReviewService],
})
export class TranslationHumanReviewModule {}
