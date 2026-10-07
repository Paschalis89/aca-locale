import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProviderUsageDto {
  @ApiProperty({
    example: 0,
  })
  characterCount!: number;

  @ApiProperty({
    example: 1000000,
  })
  characterLimit!: number;
}

export class ProviderHealthDto {
  @ApiProperty({
    enum: ['openai', 'anthropic', 'google', 'deepl'],
  })
  provider!: string;

  @ApiProperty({
    enum: ['OK', 'ERROR', 'NOT_CONFIGURED'],
  })
  status!: string;

  @ApiPropertyOptional({
    example: 214,
    nullable: true,
  })
  latencyMs!: number | null;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({
    example: 42,
  })
  availableModels?: number;

  @ApiPropertyOptional({
    type: ProviderUsageDto,
  })
  usage?: ProviderUsageDto;
}

export class ProvidersHealthDto {
  @ApiProperty({
    type: [ProviderHealthDto],
  })
  providers!: ProviderHealthDto[];
}
