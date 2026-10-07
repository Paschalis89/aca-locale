import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ApproveTranslationItemDto {
  @ApiPropertyOptional({
    description:
      'Optional manually edited translation. If omitted, the generated translatedValue is approved as-is.',
    example:
      'Snowboard con inventario non monitorato',
  })
  @IsOptional()
  @IsString()
  approvedValue?:
    string;

  @ApiPropertyOptional({
    description:
      'Optional human review note.',
    example:
      'Terminology adjusted for the Italian storefront.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?:
    string;
}