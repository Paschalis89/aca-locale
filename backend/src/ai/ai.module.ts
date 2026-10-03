import {
  Global,
  Module,
} from '@nestjs/common';

import {
  AiRegistryService,
} from './ai-registry.service.js';

@Global()
@Module({
  providers: [
    AiRegistryService,
  ],
  exports: [
    AiRegistryService,
  ],
})
export class AiModule {}