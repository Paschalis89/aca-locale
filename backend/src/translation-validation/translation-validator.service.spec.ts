import { TranslationValidatorService } from './translation-validator.service.js';

describe('TranslationValidatorService', () => {
  let validator: TranslationValidatorService;

  beforeEach(() => {
    validator = new TranslationValidatorService();
  });

  const validate = (
    sourceValue: string,

    translatedValue: string,
  ) =>
    validator.validate({
      sourceValue,
      translatedValue,

      sourceLocale: 'en',

      targetLocale: 'it',

      contentType: 'SINGLE_LINE_TEXT_FIELD',

      resourceType: 'PRODUCT',

      fieldKey: 'title',
    });

  it('passes a normal translation', () => {
    const result = validate(
      'The Inventory Not Tracked Snowboard',
      'Lo snowboard non registrato in inventario',
    );

    expect(result.passed).toBe(true);

    expect(result.errorCount).toBe(0);
  });

  it('fails when a Liquid token disappears', () => {
    const result = validate('Hello {{ customer.first_name }}', 'Ciao cliente');

    expect(result.passed).toBe(false);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LIQUID_TOKEN_MISMATCH',

          severity: 'ERROR',
        }),
      ]),
    );
  });

  it('fails when a placeholder changes', () => {
    const result = validate(
      'Hello {name}, you have %d items.',
      'Ciao {nome}, hai %d articoli.',
    );

    expect(result.passed).toBe(false);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PLACEHOLDER_MISMATCH',

          severity: 'ERROR',
        }),
      ]),
    );
  });

  it('fails when a URL changes', () => {
    const result = validate(
      'Visit https://example.com/products',
      'Visita https://example.it/products',
    );

    expect(result.passed).toBe(false);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'URL_MISMATCH',

          severity: 'ERROR',
        }),
      ]),
    );
  });

  it('fails when an email changes', () => {
    const result = validate(
      'Contact support@example.com',
      'Contatta assistenza@example.com',
    );

    expect(result.passed).toBe(false);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EMAIL_MISMATCH',

          severity: 'ERROR',
        }),
      ]),
    );
  });

  it('fails when HTML structure changes', () => {
    const result = validate(
      '<p>Hello <strong>world</strong></p>',
      '<p>Ciao mondo</p>',
    );

    expect(result.passed).toBe(false);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HTML_STRUCTURE_MISMATCH',

          severity: 'ERROR',
        }),
      ]),
    );
  });

  it('warns when numbers change without blocking validation', () => {
    const result = validate(
      'Save 20% on orders over 100 EUR',
      'Risparmia il 25% sugli ordini superiori a 100 EUR',
    );

    expect(result.passed).toBe(true);

    expect(result.warningCount).toBeGreaterThan(0);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NUMBER_TOKEN_MISMATCH',

          severity: 'WARNING',
        }),
      ]),
    );
  });

  it('warns when translation equals source', () => {
    const result = validate('Snowboard', 'Snowboard');

    expect(result.passed).toBe(true);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SAME_AS_SOURCE',

          severity: 'WARNING',
        }),
      ]),
    );
  });

  it('warns when translation is abnormally short', () => {
    const result = validate(
      'This is a considerably longer product description used for testing.',
      'Ciao',
    );

    expect(result.passed).toBe(true);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LENGTH_RATIO_LOW',

          severity: 'WARNING',
        }),
      ]),
    );
  });
});
