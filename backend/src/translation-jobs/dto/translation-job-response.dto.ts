import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class TranslationJobDto {
  @ApiProperty({
    example:
      'cmv1234567890',
  })
  id!: string;

  @ApiProperty({
    example: 'en',
  })
  sourceLocale!: string;

  @ApiProperty({
    example: 'it',
  })
  targetLocale!: string;

  @ApiProperty({
    enum: [
      'QUEUED',
      'RUNNING',
      'COMPLETED',
      'PARTIAL',
      'FAILED',
      'CANCELLED',
    ],
    example: 'QUEUED',
  })
  status!: string;

  @ApiPropertyOptional({
    enum: [
      'OPENAI',
      'ANTHROPIC',
      'GOOGLE',
    ],
    example: 'OPENAI',
    nullable: true,
  })
  provider!: string | null;

  @ApiPropertyOptional({
    example: 'gpt-5.6-luna',
    nullable: true,
  })
  model!: string | null;

  @ApiProperty({
    example: 100,
  })
  totalItems!: number;

  @ApiProperty({
    example: 0,
  })
  completedItems!: number;

  @ApiProperty({
    example: 0,
  })
  failedItems!: number;

  @ApiPropertyOptional({
    nullable: true,
  })
  startedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  completedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  errorMessage!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class TranslationJobResourceDto {
  @ApiProperty({
    example: 'PRODUCT',
  })
  resourceType!: string;

  @ApiProperty({
    example:
      'gid://shopify/Product/123456789',
  })
  shopifyResourceId!: string;
}

export class TranslationJobFieldDto {
  @ApiProperty({
    example: 'title',
  })
  key!: string;

  @ApiProperty({
    example: 'STRING',
  })
  type!: string;

  @ApiProperty({
    example: 'en',
  })
  sourceLocale!: string;

  @ApiProperty({
    type:
      TranslationJobResourceDto,
  })
  resource!:
    TranslationJobResourceDto;
}

export class TranslationJobItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fieldId!: string;

  @ApiProperty({
    enum: [
      'PENDING',
      'GENERATING',
      'GENERATED',
      'VALIDATED',
      'NEEDS_REVIEW',
      'APPROVED',
      'PUBLISHED',
      'FAILED',
    ],
    example: 'PENDING',
  })
  status!: string;

  @ApiProperty()
  sourceDigest!: string;

  @ApiProperty({
    example:
      'Example product title',
  })
  sourceValue!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  translatedValue!:
    string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  provider!:
    string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  model!:
    string | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  generatedAt!:
    Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  approvedAt!:
    Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  publishedAt!:
    Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  errorMessage!:
    string | null;

  @ApiProperty({
    type:
      TranslationJobFieldDto,
  })
  field!:
    TranslationJobFieldDto;
}

export class TranslationJobDetailDto
  extends TranslationJobDto {
  @ApiProperty({
    type: [
      TranslationJobItemDto,
    ],
  })
  items!:
    TranslationJobItemDto[];
}