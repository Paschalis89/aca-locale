import {
  Type,
} from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ShopifyLocaleDto {
  @IsString()
  @IsNotEmpty()
  locale!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsBoolean()
  primary!: boolean;

  @IsBoolean()
  published!: boolean;
}

export class SyncShopifyLocalesDto {
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => ShopifyLocaleDto)
  locales!: ShopifyLocaleDto[];
}