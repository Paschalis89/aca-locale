import {
  Module,
} from '@nestjs/common';

import {
  TranslationValidatorService,
} from './translation-validator.service.js';

@Module({
  providers: [
    TranslationValidatorService,
  ],

  exports: [
    TranslationValidatorService,
  ],
})
export class TranslationValidationModule {}