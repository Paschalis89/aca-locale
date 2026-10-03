import { Module } from '@nestjs/common';
import {
  ConfigModule,
} from '@nestjs/config';

import {
  AiModule,
} from './ai/ai.module.js';

import {
  DemoModule,
} from './demo/demo.module.js';

import {
  HealthModule,
} from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    HealthModule,
    DemoModule,
    AiModule,
  ],
})
export class AppModule {}