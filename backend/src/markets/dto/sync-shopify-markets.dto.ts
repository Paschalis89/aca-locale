import { ApiProperty } from '@nestjs/swagger';

import { Type } from 'class-transformer';

import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class ShopifyMarketDto {
  @ApiProperty({
    description: 'Shopify GraphQL Market ID.',
    example: 'gid://shopify/Market/58632306825',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({
    description: 'Market display name.',
    example: 'Canada',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'Shopify market handle.',
    example: 'canada',
  })
  @IsString()
  @IsNotEmpty()
  handle!: string;

  @ApiProperty({
    description: 'Current Shopify market status.',
    example: 'ACTIVE',
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({
    description: 'Shopify market type.',
    example: 'REGION',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;
}

export class SyncShopifyMarketsDto {
  @ApiProperty({
    description: 'Markets returned by Shopify.',
    type: [ShopifyMarketDto],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => ShopifyMarketDto)
  markets!: ShopifyMarketDto[];
}
