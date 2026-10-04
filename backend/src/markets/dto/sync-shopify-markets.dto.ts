import {
  Type,
} from 'class-transformer';

import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ShopifyMarketDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  handle!: string;

  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;
}

export class SyncShopifyMarketsDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => ShopifyMarketDto)
  markets!: ShopifyMarketDto[];
}