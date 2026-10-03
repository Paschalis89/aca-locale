import {
  Controller,
  Get,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  @Get('ping')
  @ApiOperation({
    summary: 'Demo API ping',
    description:
      'Development endpoint used to verify Swagger, OpenAPI and Postman connectivity.',
  })
  @ApiOkResponse({
    description: 'Demo API is reachable.',
    schema: {
      example: {
        status: 'ok',
        message:
          'ACA Locale demo API is reachable.',
        timestamp:
          '2026-10-03T21:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Demo endpoints are disabled.',
  })
  ping() {
    const enabled =
      this.configService.get<string>(
        'ENABLE_DEMO_ENDPOINTS',
        'false',
      ) === 'true';

    if (!enabled) {
      throw new NotFoundException(
        'Demo endpoints are disabled.',
      );
    }

    return {
      status: 'ok',
      message:
        'ACA Locale demo API is reachable.',
      timestamp: new Date().toISOString(),
    };
  }
}