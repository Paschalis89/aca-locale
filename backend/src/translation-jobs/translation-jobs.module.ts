import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  TranslationEngineModule,
} from '../translation-engine/translation-engine.module.js';

import {
  TranslationReviewModule,
} from '../translation-review/translation-review.module.js';

import {
  TranslationHumanReviewModule,
} from '../translation-human-review/translation-human-review.module.js';

import {
  TranslationPublicationModule,
} from '../translation-publication/translation-publication.module.js';

import {
  TranslationJobsController,
} from './translation-jobs.controller.js';

import {
  TranslationJobsService,
} from './translation-jobs.service.js';

import {
  TranslationQueueService,
} from './translation-queue.service.js';

@Module({
  imports: [
    DatabaseModule,
    TranslationEngineModule,
    TranslationReviewModule,
    TranslationHumanReviewModule,
    TranslationPublicationModule,
  ],

  controllers: [
    TranslationJobsController,
  ],

  providers: [
    TranslationJobsService,
    TranslationQueueService,
  ],

  exports: [
    TranslationJobsService,
    TranslationQueueService,
  ],
})
export class TranslationJobsModule {}
