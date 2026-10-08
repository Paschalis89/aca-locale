import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  GLOSSARY_RULE_TYPES,
} from './create-glossary-entry.dto.js';

import type {
  GlossaryRuleTypeValue,
} from './create-glossary-entry.dto.js';

export class UpdateGlossaryEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sourceTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  targetLocale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  targetTerm?: string | null;

  @IsOptional()
  @IsIn(GLOSSARY_RULE_TYPES)
  ruleType?: GlossaryRuleTypeValue;

  @IsOptional()
  @IsBoolean()
  caseSensitive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
