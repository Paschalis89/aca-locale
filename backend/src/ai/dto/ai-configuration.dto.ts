import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiConfigurationDto {
  @ApiProperty({
    example: 'OPENAI',
    enum: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPL'],
  })
  translationProvider!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
  })
  translationModel!: string | null;

  @ApiProperty({
    example: 'ANTHROPIC',
    enum: ['OPENAI', 'ANTHROPIC', 'GOOGLE'],
  })
  reviewProvider!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
  })
  reviewModel!: string | null;

  @ApiProperty({
    example: 'GOOGLE',
    enum: ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'DEEPL'],
  })
  fallbackProvider!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
  })
  fallbackModel!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}
