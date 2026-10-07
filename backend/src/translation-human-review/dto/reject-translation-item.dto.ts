import {
  ApiProperty,
} from '@nestjs/swagger';

import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RejectTranslationItemDto {
  @ApiProperty({
    description:
      'Reason why the generated translation was rejected.',
    example:
      'Terminology is not suitable for the Italian market.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  note:
    string;
}