import {
  Controller,
  Get,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  ReadinessService,
} from './readiness.service.js';

@ApiTags(
  'Health',
)
@Controller(
  'health',
)
export class ReadinessController {
  constructor(
    private readonly readiness:
      ReadinessService,
  ) {}

  @Get('live')
  @ApiOperation({
    summary:
      'Liveness check',
  })
  live() {
    return this.readiness.live();
  }

  @Get('ready')
  @ApiOperation({
    summary:
      'Readiness check for PostgreSQL and Redis',
  })
  ready() {
    return this.readiness.ready();
  }
}
