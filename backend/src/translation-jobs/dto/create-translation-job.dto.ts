import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  Type,
} from 'class-transformer';

export class CreateTranslationJobDto {
  @ApiProperty({
    description:
      'Target Shopify locale.',
    example: 'it',
  })
  @IsString()
  @IsNotEmpty()
  targetLocale!: string;

  @ApiProperty({
    description:
      'Shopify resource types to include in the translation job.',
    example: [
      'PRODUCT',
      'COLLECTION',
      'PAGE',
    ],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({
    each: true,
  })
  @IsNotEmpty({
    each: true,
  })
  resourceTypes!: string[];

  @ApiPropertyOptional({
    description:
      'Maximum number of translation fields to include in this job.',
    example: 100,
    default: 100,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxItems?: number;
}