import { Module } from '@nestjs/common';

import { ShopsModule } from '../shops/shops.module.js';

import { DemoController } from './demo.controller.js';

@Module({
  imports: [ShopsModule],

  controllers: [DemoController],
})
export class DemoModule {}
