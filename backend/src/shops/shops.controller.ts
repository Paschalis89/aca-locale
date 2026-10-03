import {
  Controller,
  Get,
} from '@nestjs/common';

import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  ShopsService,
} from './shops.service.js';

@ApiTags('Shops')
@Controller('shops')
export class ShopsController {
  constructor(
    private readonly shopsService:
      ShopsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List registered shops',

    description:
      'Returns the shops currently registered in ACA Locale.',
  })
  @ApiOkResponse({
    description:
      'Registered shops returned successfully.',

    schema: {
      example: [
        {
          id: 'cm123...',
          shopifyDomain:
            'aca-locale-dev-cfoxunuo.myshopify.com',
          name: 'ACA Locale Dev',
          status: 'ACTIVE',
          sourceLocale: 'it',
          settings: {
            autoTranslate: false,
            autoPublish: false,
            requireHumanReview: true,
            enableAiReview: true,
          },
          aiConfiguration: {
            translationProvider:
              'OPENAI',
            translationModel:
              null,
            reviewProvider:
              'OPENAI',
            reviewModel:
              null,
          },
        },
      ],
    },
  })
  findAll() {
    return this.shopsService.findAll();
  }
}