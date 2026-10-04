import {
  Type,
} from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class TranslationSourceDto {
  @ApiProperty({
    example: 'title',
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    example: 'SINGLE_LINE_TEXT_FIELD',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    example: 'en',
  })
  @IsString()
  @IsNotEmpty()
  locale!: string;

  @ApiProperty({
    example: 'Gift Card',
  })
  @IsString()
  value!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  digest!: string;
}

export class ExistingTranslationDto {
  @ApiProperty({
    example: 'title',
  })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({
    example: 'it',
  })
  @IsString()
  @IsNotEmpty()
  locale!: string;

  @ApiProperty()
  @IsString()
  value!: string;

  @ApiProperty()
  @IsBoolean()
  outdated!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  market?: unknown;
}

export class TranslationResourceScanDto {
  @ApiProperty({
    example:
      'gid://shopify/Product/8882758975625',
  })
  @IsString()
  @IsNotEmpty()
  resourceId!: string;

  @ApiProperty({
    type: [
      TranslationSourceDto,
    ],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () => TranslationSourceDto,
  )
  content!: TranslationSourceDto[];

  @ApiProperty({
    type: [
      ExistingTranslationDto,
    ],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () => ExistingTranslationDto,
  )
  translations!: ExistingTranslationDto[];
}

export class SyncTranslationScanDto {
  @ApiProperty({
    example: 'PRODUCT',
  })
  @IsString()
  @IsNotEmpty()
  resourceType!: string;

  @ApiProperty({
    example: 'it',
  })
  @IsString()
  @IsNotEmpty()
  targetLocale!: string;

  @ApiProperty({
    type: [
      TranslationResourceScanDto,
    ],
  })
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () => TranslationResourceScanDto,
  )
  resources!: TranslationResourceScanDto[];
}