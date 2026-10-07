import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Backend health check',
    description: 'Checks whether the ACA Locale backend is running.',
  })
  @ApiOkResponse({
    description: 'Backend is healthy.',
    schema: {
      example: {
        status: 'ok',
        service: 'aca-locale-backend',
        version: '0.1.0',
        environment: 'development',
        timestamp: '2026-10-03T21:00:00.000Z',
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      service: 'aca-locale-backend',
      version: '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
