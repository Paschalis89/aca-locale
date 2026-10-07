import {
  ApiProperty,
} from '@nestjs/swagger';

export class AiProviderStatusDto {
  @ApiProperty({
    enum: [
      'openai',
      'anthropic',
      'google',
      'deepl',
    ],
    example: 'openai',
  })
  provider!: string;

  @ApiProperty({
    example: true,
  })
  configured!: boolean;

  @ApiProperty({
    example: true,
  })
  supportsTranslation!: boolean;

  @ApiProperty({
    example: true,
  })
  supportsReview!: boolean;

  @ApiProperty({
    example: true,
  })
  requiresModel!: boolean;
}

export class AiProvidersStatusDto {
  @ApiProperty({
    type: [
      AiProviderStatusDto,
    ],
  })
  providers!:
    AiProviderStatusDto[];
}