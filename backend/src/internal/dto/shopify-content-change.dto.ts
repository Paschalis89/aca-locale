import { Type } from 'class-transformer';

import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  ExistingTranslationDto,
  TranslationSourceDto,
} from '../../translation-scanner/dto/sync-translation-scan.dto.js';

import { ShopifyShopEventDto } from './shopify-shop-event.dto.js';

export class ClaimShopifyContentChangeDto extends ShopifyShopEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  webhookId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  topic!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  resourceType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  shopifyResourceId!: string;

  @IsString()
  @IsIn(['UPSERT', 'DELETE'])
  action!: 'UPSERT' | 'DELETE';

  @IsOptional()
  @IsString()
  triggeredAt?: string;
}

export class TranslationLocaleScanDto {
  @IsString()
  @IsNotEmpty()
  targetLocale!: string;

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => ExistingTranslationDto)
  translations!: ExistingTranslationDto[];
}

export class ProcessShopifyContentUpsertDto extends ShopifyShopEventDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  resourceType!: string;

  @IsString()
  @IsNotEmpty()
  shopifyResourceId!: string;

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => TranslationSourceDto)
  content!: TranslationSourceDto[];

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => TranslationLocaleScanDto)
  locales!: TranslationLocaleScanDto[];
}

export class ProcessShopifyContentDeleteDto extends ShopifyShopEventDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  resourceType!: string;

  @IsString()
  @IsNotEmpty()
  shopifyResourceId!: string;
}

export class FailShopifyContentChangeDto extends ShopifyShopEventDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  errorMessage!: string;
}
