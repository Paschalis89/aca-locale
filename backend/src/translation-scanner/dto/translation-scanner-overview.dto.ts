import { ApiProperty } from '@nestjs/swagger';

export class TranslationResourceTypeSummaryDto {
  @ApiProperty({
    example: 'PRODUCT',
  })
  resourceType!: string;

  @ApiProperty({
    enum: ['CONTENT', 'CUSTOM_DATA', 'COMMERCE', 'THEME', 'SYSTEM', 'OTHER'],
    example: 'CONTENT',
  })
  group!: string;

  @ApiProperty({
    example: 17,
  })
  resources!: number;

  @ApiProperty({
    example: 57,
  })
  fields!: number;

  @ApiProperty({
    example: 56,
  })
  actionableFields!: number;

  @ApiProperty({
    example: 1,
  })
  emptySource!: number;

  @ApiProperty({
    example: 56,
  })
  missing!: number;

  @ApiProperty({
    example: 0,
  })
  translated!: number;

  @ApiProperty({
    example: 0,
  })
  outdated!: number;

  @ApiProperty({
    example: 0,
  })
  coverage!: number;
}

export class TranslationGroupSummaryDto {
  @ApiProperty({
    enum: ['CONTENT', 'CUSTOM_DATA', 'COMMERCE', 'THEME', 'SYSTEM', 'OTHER'],
    example: 'CONTENT',
  })
  group!: string;

  @ApiProperty({
    example: 12,
  })
  resourceTypes!: number;

  @ApiProperty({
    example: 8,
  })
  resourceTypesWithContent!: number;

  @ApiProperty({
    example: 96,
  })
  resources!: number;

  @ApiProperty({
    example: 145,
  })
  fields!: number;

  @ApiProperty({
    example: 143,
  })
  actionableFields!: number;

  @ApiProperty({
    example: 2,
  })
  emptySource!: number;

  @ApiProperty({
    example: 143,
  })
  missing!: number;

  @ApiProperty({
    example: 0,
  })
  translated!: number;

  @ApiProperty({
    example: 0,
  })
  outdated!: number;

  @ApiProperty({
    example: 0,
  })
  coverage!: number;
}

export class TranslationOverallSummaryDto {
  @ApiProperty({
    example: 30,
  })
  resourceTypes!: number;

  @ApiProperty({
    example: 22,
  })
  resourceTypesWithContent!: number;

  @ApiProperty({
    example: 126,
  })
  resources!: number;

  @ApiProperty({
    example: 9173,
  })
  fields!: number;

  @ApiProperty({
    example: 9163,
  })
  actionableFields!: number;

  @ApiProperty({
    example: 10,
  })
  emptySource!: number;

  @ApiProperty({
    example: 9163,
  })
  missing!: number;

  @ApiProperty({
    example: 0,
  })
  translated!: number;

  @ApiProperty({
    example: 0,
  })
  outdated!: number;

  @ApiProperty({
    example: 0,
  })
  coverage!: number;
}

export class TranslationScannerOverviewDto {
  @ApiProperty({
    example: 'aca-locale-dev-cfoxunuo.myshopify.com',
  })
  shopifyDomain!: string;

  @ApiProperty({
    example: 'it',
  })
  targetLocale!: string;

  @ApiProperty({
    type: TranslationOverallSummaryDto,
  })
  summary!: TranslationOverallSummaryDto;

  @ApiProperty({
    type: [TranslationGroupSummaryDto],
  })
  groups!: TranslationGroupSummaryDto[];
}

export class TranslationResourceTypesOverviewDto {
  @ApiProperty({
    example: 'aca-locale-dev-cfoxunuo.myshopify.com',
  })
  shopifyDomain!: string;

  @ApiProperty({
    example: 'it',
  })
  targetLocale!: string;

  @ApiProperty({
    type: [TranslationResourceTypeSummaryDto],
  })
  resourceTypes!: TranslationResourceTypeSummaryDto[];
}
