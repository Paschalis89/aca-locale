import {
  Type,
} from 'class-transformer';

import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

import {
  ApiProperty,
} from '@nestjs/swagger';

import {
  ShopifyLocaleDto,
} from '../../languages/dto/sync-shopify-locales.dto.js';

import {
  ShopifyMarketDto,
} from '../../markets/dto/sync-shopify-markets.dto.js';

export class ShopifyPrimaryDomainDto {
  @ApiProperty({
    example:
      'aca-locale-dev-cfoxunuo.myshopify.com',
  })
  @IsString()
  @IsNotEmpty()
  host!: string;

  @ApiProperty({
    example:
      'https://aca-locale-dev-cfoxunuo.myshopify.com',
  })
  @IsString()
  @IsNotEmpty()
  url!: string;
}

export class ShopifyShopIdentityDto {
  @ApiProperty({
    example:
      'gid://shopify/Shop/78982250633',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    example:
      'ACA Locale Dev',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example:
      'USD',
  })
  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @ApiProperty({
    example:
      'America/New_York',
  })
  @IsString()
  @IsNotEmpty()
  ianaTimezone!: string;

  @ApiProperty({
    type:
      ShopifyPrimaryDomainDto,
  })
  @ValidateNested()
  @Type(
    () => ShopifyPrimaryDomainDto,
  )
  primaryDomain!:
    ShopifyPrimaryDomainDto;
}

export class SyncShopifyConfigurationDto {
  @ApiProperty({
    type:
      ShopifyShopIdentityDto,
  })
  @ValidateNested()
  @Type(
    () => ShopifyShopIdentityDto,
  )
  shop!:
    ShopifyShopIdentityDto;

  @ApiProperty({
    type: [
      ShopifyLocaleDto,
    ],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () => ShopifyLocaleDto,
  )
  locales!:
    ShopifyLocaleDto[];

  @ApiProperty({
    type: [
      ShopifyMarketDto,
    ],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () => ShopifyMarketDto,
  )
  markets!:
    ShopifyMarketDto[];
}