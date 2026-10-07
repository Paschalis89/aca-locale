import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ShopifyLocaleDto {
  @ApiProperty({
    description: 'Shopify locale code.',
    example: 'en',
  })
  @IsString()
  @IsNotEmpty()
  locale!: string;

  @ApiProperty({
    description: 'Human-readable language name.',
    example: 'English',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Whether this is the primary Shopify language.',
    example: true,
  })
  @IsBoolean()
  primary!: boolean;

  @ApiProperty({
    description: 'Whether this language is published on Shopify.',
    example: true,
  })
  @IsBoolean()
  published!: boolean;
}

export class SyncShopifyLocalesDto {
  @ApiProperty({
    description: 'Locales returned by Shopify.',
    type: [ShopifyLocaleDto],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => ShopifyLocaleDto)
  locales!: ShopifyLocaleDto[];
}
