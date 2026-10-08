import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const GLOSSARY_RULE_TYPES = [
  'DO_NOT_TRANSLATE',
  'PREFERRED_TRANSLATION',
  'FORBIDDEN_TRANSLATION',
] as const;

export type GlossaryRuleTypeValue =
  (typeof GLOSSARY_RULE_TYPES)[number];

export class CreateGlossaryEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sourceTerm!: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  targetLocale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  targetTerm?: string | null;

  @IsIn(GLOSSARY_RULE_TYPES)
  ruleType!: GlossaryRuleTypeValue;

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
