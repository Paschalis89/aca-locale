import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class AiModelCatalogItemDto {
  @ApiProperty({
    example: 'gpt-5.6-luna',
  })
  id!: string;

  @ApiProperty({
    example: 'gpt-5.6-luna',
  })
  name!: string;

  @ApiProperty({
    description:
      'Whether ACA Locale considers this model suitable for text translation/review.',
    example: true,
  })
  selectable!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example:
      '2026-09-01T00:00:00.000Z',
  })
  createdAt?: string | null;
}

export class AiProviderModelCatalogDto {
  @ApiProperty({
    enum: [
      'openai',
      'anthropic',
      'google',
      'deepl',
    ],
  })
  provider!: string;

  @ApiProperty({
    enum: [
      'OK',
      'ERROR',
      'NOT_CONFIGURED',
    ],
  })
  status!: string;

  @ApiProperty({
    example: true,
  })
  configured!: boolean;

  @ApiProperty({
    example: true,
  })
  requiresModel!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({
    example: 12,
  })
  modelCount!: number;

  @ApiProperty({
    type: [
      AiModelCatalogItemDto,
    ],
  })
  models!:
    AiModelCatalogItemDto[];
}

export class AiModelCatalogDto {
  @ApiProperty({
    example:
      '2026-10-05T00:00:00.000Z',
  })
  generatedAt!: string;

  @ApiProperty({
    type: [
      AiProviderModelCatalogDto,
    ],
  })
  providers!:
    AiProviderModelCatalogDto[];
}