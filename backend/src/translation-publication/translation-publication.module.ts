import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';

import { AutomaticTranslationPublicationService } from './automatic-translation-publication.service.js';

import { TranslationPublicationService } from './translation-publication.service.js';

@Module({
  imports: [DatabaseModule],

  providers: [
    TranslationPublicationService,
    AutomaticTranslationPublicationService,
  ],

  exports: [
    TranslationPublicationService,
    AutomaticTranslationPublicationService,
  ],
})
export class TranslationPublicationModule {}
