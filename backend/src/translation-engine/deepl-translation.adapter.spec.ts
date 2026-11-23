import { DeepLTranslationAdapter } from './deepl-translation.adapter.js';

import type { ResolvedGlossaryRule } from '../glossary/glossary.types.js';

const baseRule = (
  overrides: Partial<ResolvedGlossaryRule>,
): ResolvedGlossaryRule => ({
  id: 'rule-1',
  glossaryId: 'glossary-1',
  glossaryName: 'Master Glossary',
  sourceTerm: 'Vietri',
  targetLocale: '*',
  targetTerm: null,
  ruleType: 'DO_NOT_TRANSLATE',
  caseSensitive: false,
  notes: null,
  ...overrides,
});

describe('DeepLTranslationAdapter glossary integration', () => {
  it('protects required glossary terms before DeepL and restores them afterwards', async () => {
    const deepL = {
      translate: vi.fn().mockImplementation(async (input: { text: string }) => ({
        text: input.text,
        billedCharacters: 20,
      })),
    } as any;

    const adapter = new DeepLTranslationAdapter(deepL);

    const result = await adapter.translate({
      text: 'Handmade ceramic from Vietri',
      sourceLocale: 'en',
      targetLocale: 'it',
      glossaryRules: [
        baseRule({
          sourceTerm: 'Handmade',
          targetLocale: 'it',
          targetTerm: 'Fatto a mano',
          ruleType: 'PREFERRED_TRANSLATION',
        }),
        baseRule({
          sourceTerm: 'Vietri',
          ruleType: 'DO_NOT_TRANSLATE',
        }),
      ],
    });

    const sentText = deepL.translate.mock.calls[0][0].text as string;

    expect(sentText).toContain('__ACA_GLOSSARY_');
    expect(sentText).not.toContain('Handmade');
    expect(sentText).not.toContain('Vietri');
    expect(result.text).toContain('Fatto a mano');
    expect(result.text).toContain('Vietri');
  });
});

describe('DeepLTranslationAdapter HTML safety', () => {
  it('sends valid HTML unchanged and preserves translated markup', async () => {
    const deepL = {
      translate: vi.fn().mockResolvedValue({
        text: '<p>This ceramic plate is handmade on the Amalfi Coast.</p>',
        billedCharacters: 75,
      }),
    } as any;
    const adapter = new DeepLTranslationAdapter(deepL);
    const result = await adapter.translate({
      text: '<p>Questo piatto in ceramica è realizzato a mano sulla Costiera Amalfitana.</p>',
      contentType: 'HTML',
      sourceLocale: 'it',
      targetLocale: 'en',
    });
    expect(deepL.translate).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'HTML',
      text: '<p>Questo piatto in ceramica è realizzato a mano sulla Costiera Amalfitana.</p>',
    }));
    expect(result.text).toBe('<p>This ceramic plate is handmade on the Amalfi Coast.</p>');
  });

  it('does not call DeepL for escaped HTML or code-only prose', async () => {
    const deepL = { translate: vi.fn() } as any;
    const adapter = new DeepLTranslationAdapter(deepL);
    for (const text of [
      '<p>&lt;p&gt;Descrizione&lt;/p&gt;</p>',
      '<p><code>Descrizione del prodotto</code></p>',
    ]) {
      await expect(adapter.translate({ text, contentType: 'HTML', sourceLocale: 'it', targetLocale: 'en' })).rejects.toThrow();
    }
    expect(deepL.translate).not.toHaveBeenCalled();
  });

  it('rejects a DeepL response that leaves substantial Italian HTML prose unchanged', async () => {
    const text = '<p>Questo piatto in ceramica è realizzato a mano da artigiani della Costiera Amalfitana.</p>';
    const deepL = { translate: vi.fn().mockResolvedValue({ text }) } as any;
    const adapter = new DeepLTranslationAdapter(deepL);
    await expect(adapter.translate({ text, contentType: 'HTML', sourceLocale: 'it', targetLocale: 'en' })).rejects.toThrow(/identical to the source/);
  });
});
