import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

import {
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

const translationProviders = [
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
  'DEEPL',
] as const;

const aiProviders = [
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
] as const;

export class UpdateAiConfigurationDto {
  @ApiPropertyOptional({
    enum:
      translationProviders,
    example:
      'DEEPL',
  })
  @IsOptional()
  @IsIn(
    translationProviders,
  )
  translationProvider?:
    'OPENAI' |
    'ANTHROPIC' |
    'GOOGLE' |
    'DEEPL';

  @ApiPropertyOptional({
    example:
      'gpt-5.6',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  translationModel?:
    string | null;

  @ApiPropertyOptional({
    enum:
      aiProviders,
    example:
      'ANTHROPIC',
  })
  @IsOptional()
  @IsIn(
    aiProviders,
  )
  reviewProvider?:
    'OPENAI' |
    'ANTHROPIC' |
    'GOOGLE';

  @ApiPropertyOptional({
    example:
      'claude-sonnet-...',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  reviewModel?:
    string | null;

  @ApiPropertyOptional({
    enum:
      translationProviders,
    example:
      'GOOGLE',
  })
  @IsOptional()
  @IsIn(
    translationProviders,
  )
  fallbackProvider?:
    'OPENAI' |
    'ANTHROPIC' |
    'GOOGLE' |
    'DEEPL';

  @ApiPropertyOptional({
    example:
      'gemini-...',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  fallbackModel?:
    string | null;
}