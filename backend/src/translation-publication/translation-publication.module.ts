import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  TranslationPublicationService,
} from './translation-publication.service.js';

@Module({
  imports: [
    DatabaseModule,
  ],

  providers: [
    TranslationPublicationService,
  ],

  exports: [
    TranslationPublicationService,
  ],
})
export class TranslationPublicationModule {}