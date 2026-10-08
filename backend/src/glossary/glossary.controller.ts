import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentShop,
} from '../shopify-auth/current-shop.decorator.js';

import {
  ShopifyAuthGuard,
} from '../shopify-auth/shopify-auth.guard.js';

import type {
  ShopifyAuthContext,
} from '../shopify-auth/shopify-auth.types.js';

import {
  CreateGlossaryDto,
} from './dto/create-glossary.dto.js';

import {
  CreateGlossaryEntryDto,
} from './dto/create-glossary-entry.dto.js';

import {
  UpdateGlossaryDto,
} from './dto/update-glossary.dto.js';

import {
  UpdateGlossaryEntryDto,
} from './dto/update-glossary-entry.dto.js';

import {
  GlossaryService,
} from './glossary.service.js';

@ApiTags(
  'Glossary',
)
@ApiBearerAuth()
@Controller(
  'glossaries',
)
@UseGuards(
  ShopifyAuthGuard,
)
export class GlossaryController {
  constructor(
    private readonly glossaryService:
      GlossaryService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List glossaries for the authenticated shop',
  })
  list(
    @CurrentShop()
    shop:
      ShopifyAuthContext,
  ) {
    return this.glossaryService.list(
      shop.shopDomain,
    );
  }

  @Get('default')
  @ApiOperation({
    summary:
      'Get or create the shop default glossary',
  })
  getDefault(
    @CurrentShop()
    shop:
      ShopifyAuthContext,
  ) {
    return this.glossaryService.getDefault(
      shop.shopDomain,
    );
  }

  @Post('default/entries')
  @ApiOperation({
    summary:
      'Add an entry to the default glossary',
  })
  createDefaultEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      CreateGlossaryEntryDto,
  ) {
    return this.glossaryService.createDefaultEntry(
      shop.shopDomain,
      body,
    );
  }

  @Patch(
    'default/entries/:entryId',
  )
  @ApiOperation({
    summary:
      'Update an entry in the default glossary',
  })
  updateDefaultEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('entryId')
    entryId:
      string,

    @Body()
    body:
      UpdateGlossaryEntryDto,
  ) {
    return this.glossaryService.updateDefaultEntry(
      shop.shopDomain,
      entryId,
      body,
    );
  }

  @Delete(
    'default/entries/:entryId',
  )
  @ApiOperation({
    summary:
      'Delete an entry from the default glossary',
  })
  removeDefaultEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('entryId')
    entryId:
      string,
  ) {
    return this.glossaryService.removeDefaultEntry(
      shop.shopDomain,
      entryId,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a glossary',
  })
  create(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Body()
    body:
      CreateGlossaryDto,
  ) {
    return this.glossaryService.create(
      shop.shopDomain,
      body,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a glossary',
  })
  findOne(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    id:
      string,
  ) {
    return this.glossaryService.findOne(
      shop.shopDomain,
      id,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a glossary',
  })
  update(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    id:
      string,

    @Body()
    body:
      UpdateGlossaryDto,
  ) {
    return this.glossaryService.update(
      shop.shopDomain,
      id,
      body,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete a glossary',
  })
  remove(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    id:
      string,
  ) {
    return this.glossaryService.remove(
      shop.shopDomain,
      id,
    );
  }

  @Post(':id/entries')
  @ApiOperation({
    summary:
      'Add an entry to a glossary',
  })
  createEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    glossaryId:
      string,

    @Body()
    body:
      CreateGlossaryEntryDto,
  ) {
    return this.glossaryService.createEntry(
      shop.shopDomain,
      glossaryId,
      body,
    );
  }

  @Patch(
    ':id/entries/:entryId',
  )
  @ApiOperation({
    summary:
      'Update a glossary entry',
  })
  updateEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    glossaryId:
      string,

    @Param('entryId')
    entryId:
      string,

    @Body()
    body:
      UpdateGlossaryEntryDto,
  ) {
    return this.glossaryService.updateEntry(
      shop.shopDomain,
      glossaryId,
      entryId,
      body,
    );
  }

  @Delete(
    ':id/entries/:entryId',
  )
  @ApiOperation({
    summary:
      'Delete a glossary entry',
  })
  removeEntry(
    @CurrentShop()
    shop:
      ShopifyAuthContext,

    @Param('id')
    glossaryId:
      string,

    @Param('entryId')
    entryId:
      string,
  ) {
    return this.glossaryService.removeEntry(
      shop.shopDomain,
      glossaryId,
      entryId,
    );
  }
}
