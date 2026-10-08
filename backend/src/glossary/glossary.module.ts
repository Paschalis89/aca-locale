import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module.js';

import {
  GlossaryController,
} from './glossary.controller.js';

import {
  GlossaryService,
} from './glossary.service.js';

@Module({
  imports: [
    DatabaseModule,
  ],

  controllers: [
    GlossaryController,
  ],

  providers: [
    GlossaryService,
  ],

  exports: [
    GlossaryService,
  ],
})
export class GlossaryModule {}
