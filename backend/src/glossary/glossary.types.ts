export type GlossaryRuleType =
  | 'DO_NOT_TRANSLATE'
  | 'PREFERRED_TRANSLATION'
  | 'FORBIDDEN_TRANSLATION';

export type ResolvedGlossaryRule = {
  id: string;

  glossaryId: string;

  glossaryName: string;

  sourceTerm: string;

  targetLocale: string;

  targetTerm: string | null;

  ruleType: GlossaryRuleType;

  caseSensitive: boolean;

  notes: string | null;
};

export type GlossaryProtection = {
  token: string;

  replacement: string;

  rule: ResolvedGlossaryRule;
};
