import { Injectable } from '@nestjs/common';

import { glossaryTermMatches } from '../glossary/glossary-rule.utils.js';

import type {
  TranslationValidationInput,
  TranslationValidationIssue,
  TranslationValidationResult,
} from './translation-validation.types.js';

@Injectable()
export class TranslationValidatorService {
  private readonly version = 'deterministic-v2-glossary';

  validate(input: TranslationValidationInput): TranslationValidationResult {
    const issues: TranslationValidationIssue[] = [];

    const source = input.sourceValue ?? '';

    const translated = input.translatedValue ?? '';

    /*
     * Empty translation is always
     * blocking.
     *
     * We return immediately to avoid
     * generating a cascade of secondary
     * missing-token errors.
     */
    if (translated.trim().length === 0) {
      issues.push({
        code: 'EMPTY_TRANSLATION',

        severity: 'ERROR',

        message: 'The translated value is empty.',
      });

      return this.result(issues);
    }

    this.validateLiquid(source, translated, issues);

    this.validatePlaceholders(source, translated, issues);

    this.validateUrls(source, translated, issues);

    this.validateEmails(source, translated, issues);

    this.validateHtml(source, translated, issues);

    this.validateNumbers(source, translated, issues);

    this.validateGlossary(input, source, translated, issues);

    this.validateSameAsSource(source, translated, issues);

    this.validateLengthRatio(source, translated, issues);

    return this.result(issues);
  }


  getVersion() {
    return this.version;
  }

  private validateGlossary(
    input: TranslationValidationInput,

    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    for (const rule of input.glossaryRules ?? []) {
      if (
        !glossaryTermMatches(
          source,
          rule.sourceTerm,
          rule.caseSensitive,
        )
      ) {
        continue;
      }

      if (rule.ruleType === 'DO_NOT_TRANSLATE') {
        if (
          !glossaryTermMatches(
            translated,
            rule.sourceTerm,
            rule.caseSensitive,
          )
        ) {
          issues.push({
            code: 'GLOSSARY_PROTECTED_TERM_CHANGED',

            severity: 'ERROR',

            message: `Protected glossary term "${rule.sourceTerm}" must remain unchanged.`,

            expected: [rule.sourceTerm],

            actual: [],

            glossaryEntryId: rule.id,

            sourceTerm: rule.sourceTerm,

            targetTerm: null,
          });
        }

        continue;
      }

      if (rule.ruleType === 'PREFERRED_TRANSLATION') {
        if (
          rule.targetTerm &&
          !glossaryTermMatches(
            translated,
            rule.targetTerm,
            rule.caseSensitive,
          )
        ) {
          issues.push({
            code: 'GLOSSARY_REQUIRED_TERM_MISSING',

            severity: 'ERROR',

            message: `Glossary requires "${rule.targetTerm}" for source term "${rule.sourceTerm}".`,

            expected: [rule.targetTerm],

            actual: [],

            glossaryEntryId: rule.id,

            sourceTerm: rule.sourceTerm,

            targetTerm: rule.targetTerm,
          });
        }

        continue;
      }

      if (
        rule.ruleType === 'FORBIDDEN_TRANSLATION' &&
        rule.targetTerm &&
        glossaryTermMatches(
          translated,
          rule.targetTerm,
          rule.caseSensitive,
        )
      ) {
        issues.push({
          code: 'GLOSSARY_FORBIDDEN_TERM_USED',

          severity: 'ERROR',

          message: `Glossary forbids "${rule.targetTerm}" for source term "${rule.sourceTerm}".`,

          expected: [],

          actual: [rule.targetTerm],

          glossaryEntryId: rule.id,

          sourceTerm: rule.sourceTerm,

          targetTerm: rule.targetTerm,
        });
      }
    }
  }

  private validateLiquid(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const expected = this.extractLiquidTokens(source);

    const actual = this.extractLiquidTokens(translated);

    if (!this.sameMultiset(expected, actual)) {
      issues.push({
        code: 'LIQUID_TOKEN_MISMATCH',

        severity: 'ERROR',

        message:
          'Liquid tokens were changed, removed, or added during translation.',

        expected,
        actual,
      });
    }
  }

  private validatePlaceholders(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const expected = this.extractPlaceholders(source);

    const actual = this.extractPlaceholders(translated);

    if (!this.sameMultiset(expected, actual)) {
      issues.push({
        code: 'PLACEHOLDER_MISMATCH',

        severity: 'ERROR',

        message:
          'One or more placeholders were changed, removed, or added during translation.',

        expected,
        actual,
      });
    }
  }

  private validateUrls(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const expected = this.extractUrls(source);

    const actual = this.extractUrls(translated);

    if (!this.sameMultiset(expected, actual)) {
      issues.push({
        code: 'URL_MISMATCH',

        severity: 'ERROR',

        message:
          'One or more URLs were changed, removed, or added during translation.',

        expected,
        actual,
      });
    }
  }

  private validateEmails(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const expected = this.extractEmails(source);

    const actual = this.extractEmails(translated);

    if (!this.sameMultiset(expected, actual)) {
      issues.push({
        code: 'EMAIL_MISMATCH',

        severity: 'ERROR',

        message:
          'One or more email addresses were changed, removed, or added during translation.',

        expected,
        actual,
      });
    }
  }

  private validateHtml(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const expected = this.extractHtmlStructure(source);

    const actual = this.extractHtmlStructure(translated);

    if (!this.sameSequence(expected, actual)) {
      issues.push({
        code: 'HTML_STRUCTURE_MISMATCH',

        severity: 'ERROR',

        message: 'HTML structure was changed during translation.',

        expected,
        actual,
      });
    }
  }

  private validateNumbers(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    /*
     * Compare digit groups rather than
     * formatted numbers.
     *
     * Example:
     *
     * 1,000.50
     * 1.000,50
     *
     * both produce:
     *
     * ["1", "000", "50"]
     *
     * so normal localization of decimal
     * separators does not trigger an
     * unnecessary warning.
     */
    const expected = source.match(/\d+/g) ?? [];

    const actual = translated.match(/\d+/g) ?? [];

    if (!this.sameMultiset(expected, actual)) {
      issues.push({
        code: 'NUMBER_TOKEN_MISMATCH',

        severity: 'WARNING',

        message: 'Numeric values differ between source and translation.',

        expected,
        actual,
      });
    }
  }

  private validateSameAsSource(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const normalizedSource = this.normalizeText(source);

    const normalizedTranslated = this.normalizeText(translated);

    if (normalizedSource.length < 4 || !/[A-Za-zÀ-ÿ]/u.test(normalizedSource)) {
      return;
    }

    if (
      normalizedSource.toLocaleLowerCase() ===
      normalizedTranslated.toLocaleLowerCase()
    ) {
      issues.push({
        code: 'SAME_AS_SOURCE',

        severity: 'WARNING',

        message: 'Translation is identical to the source text.',
      });
    }
  }

  private validateLengthRatio(
    source: string,

    translated: string,

    issues: TranslationValidationIssue[],
  ) {
    const sourceText = this.visibleText(source);

    const translatedText = this.visibleText(translated);

    /*
     * Very short strings are too noisy
     * for length-ratio validation.
     */
    if (sourceText.length < 12) {
      return;
    }

    if (sourceText.length === 0) {
      return;
    }

    const ratio = translatedText.length / sourceText.length;

    if (ratio < 0.35) {
      issues.push({
        code: 'LENGTH_RATIO_LOW',

        severity: 'WARNING',

        message: `Translation is unusually short compared with the source (ratio ${ratio.toFixed(
          2,
        )}).`,
      });
    }

    if (ratio > 3) {
      issues.push({
        code: 'LENGTH_RATIO_HIGH',

        severity: 'WARNING',

        message: `Translation is unusually long compared with the source (ratio ${ratio.toFixed(
          2,
        )}).`,
      });
    }
  }

  private extractLiquidTokens(value: string) {
    const matches = value.match(/{{[\s\S]*?}}|{%[\s\S]*?%}/g) ?? [];

    return matches.map((token) => this.normalizeLiquidToken(token));
  }

  private normalizeLiquidToken(token: string) {
    if (token.startsWith('{{')) {
      const inner = token.slice(2, -2).trim().replace(/\s+/g, ' ');

      return `{{${inner}}}`;
    }

    const inner = token.slice(2, -2).trim().replace(/\s+/g, ' ');

    return `{%${inner}%}`;
  }

  private extractPlaceholders(value: string) {
    const tokens: string[] = [];

    /*
     * printf style:
     *
     * %s
     * %d
     * %1$s
     * %2$d
     */
    const printf = value.match(/%(?:\d+\$)?[sdifouxXeEgGc]/g) ?? [];

    tokens.push(...printf);

    /*
     * JavaScript / template style:
     *
     * ${name}
     */
    const dollarBraces = value.match(/\$\{[A-Za-z_][A-Za-z0-9_.-]*\}/g) ?? [];

    tokens.push(...dollarBraces);

    /*
     * Generic placeholders:
     *
     * {name}
     * {count}
     *
     * Avoid Liquid {{ ... }}.
     */
    const braces =
      value.match(/(?<![$\{])\{[A-Za-z_][A-Za-z0-9_.-]*\}(?!})/g) ?? [];

    tokens.push(...braces);

    return tokens;
  }

  private extractUrls(value: string) {
    const matches = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [];

    return matches.map((url) => url.replace(/[),.;!?]+$/g, ''));
  }

  private extractEmails(value: string) {
    return (
      value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []
    ).map((email) => email.toLocaleLowerCase());
  }

  private extractHtmlStructure(value: string) {
    const tags: string[] = [];

    const regex = /<\/?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/g;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(value)) !== null) {
      const raw = match[0];

      const name = match[1].toLocaleLowerCase();

      if (raw.startsWith('</')) {
        tags.push(`</${name}>`);

        continue;
      }

      if (raw.endsWith('/>') || this.isVoidHtmlTag(name)) {
        tags.push(`<${name}/>`);

        continue;
      }

      tags.push(`<${name}>`);
    }

    return tags;
  }

  private isVoidHtmlTag(name: string) {
    return new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]).has(name);
  }

  private visibleText(value: string) {
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/{{[\s\S]*?}}|{%[\s\S]*?%}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeText(value: string) {
    return value.replace(/\s+/g, ' ').trim();
  }

  private sameSequence(
    left: string[],

    right: string[],
  ) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  private sameMultiset(
    left: string[],

    right: string[],
  ) {
    if (left.length !== right.length) {
      return false;
    }

    const leftSorted = [...left].sort();

    const rightSorted = [...right].sort();

    return leftSorted.every((value, index) => value === rightSorted[index]);
  }

  private result(
    issues: TranslationValidationIssue[],
  ): TranslationValidationResult {
    const errorCount = issues.filter(
      (issue) => issue.severity === 'ERROR',
    ).length;

    const warningCount = issues.filter(
      (issue) => issue.severity === 'WARNING',
    ).length;

    return {
      version: this.version,

      passed: errorCount === 0,

      errorCount,

      warningCount,

      issues,
    };
  }
}
