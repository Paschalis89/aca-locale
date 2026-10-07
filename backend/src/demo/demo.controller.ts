import { Controller, Get, NotFoundException, Post } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ShopsService } from '../shops/shops.service.js';

@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(
    private readonly configService: ConfigService,

    private readonly shopsService: ShopsService,
  ) {}

  private ensureDemoEnabled() {
    const enabled =
      this.configService.get<string>('ENABLE_DEMO_ENDPOINTS', 'false') ===
      'true';

    if (!enabled) {
      throw new NotFoundException('Demo endpoints are disabled.');
    }
  }

  @Get('ping')
  @ApiOperation({
    summary: 'Demo API ping',

    description:
      'Development endpoint used to verify Swagger, OpenAPI and API connectivity.',
  })
  @ApiOkResponse({
    description: 'Demo API is reachable.',

    schema: {
      example: {
        status: 'ok',
        message: 'ACA Locale demo API is reachable.',
        timestamp: '2026-10-03T21:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Demo endpoints are disabled.',
  })
  ping() {
    this.ensureDemoEnabled();

    return {
      status: 'ok',
      message: 'ACA Locale demo API is reachable.',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('bootstrap-shop')
  @ApiOperation({
    summary: 'Bootstrap ACA Locale development shop',

    description:
      'Creates or updates the ACA Locale development Shopify store together with its default settings and AI configuration. Development/demo only.',
  })
  @ApiCreatedResponse({
    description: 'Development shop successfully bootstrapped.',
  })
  @ApiNotFoundResponse({
    description: 'Demo endpoints are disabled.',
  })
  bootstrapShop() {
    this.ensureDemoEnabled();

    return this.shopsService.bootstrapAcaLocaleDev();
  }

  @Get('shops')
  @ApiOperation({
    summary: 'List all demo shops',
  })
  @ApiOkResponse({
    description: 'Returns all registered shops. Development/demo only.',
  })
  listShops() {
    this.ensureDemoEnabled();

    return this.shopsService.findAll();
  }
}
