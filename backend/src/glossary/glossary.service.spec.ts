import { GlossaryService } from './glossary.service.js';

describe('GlossaryService pipeline rules', () => {
  it('loads rules only through the authenticated shop and prefers locale-specific rules', async () => {
    const prisma = {
      shop: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'shop-a',
          sourceLocale: 'en',
        }),
      },
      glossaryEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'wildcard',
            sourceTerm: 'Handmade',
            targetLocale: '*',
            targetTerm: 'Generic',
            ruleType: 'PREFERRED_TRANSLATION',
            caseSensitive: false,
            notes: null,
            glossary: {
              id: 'g-1',
              name: 'Master Glossary',
              isDefault: true,
            },
          },
          {
            id: 'italian',
            sourceTerm: 'Handmade',
            targetLocale: 'it',
            targetTerm: 'Fatto a mano',
            ruleType: 'PREFERRED_TRANSLATION',
            caseSensitive: false,
            notes: null,
            glossary: {
              id: 'g-1',
              name: 'Master Glossary',
              isDefault: true,
            },
          },
        ]),
      },
    } as any;

    const service = new GlossaryService(prisma);

    const result = await service.resolveRulesForText(
      'shop-a.myshopify.com',
      'en-US',
      'it-IT',
      'Handmade ceramic bowl',
    );

    expect(prisma.shop.findUnique).toHaveBeenCalledWith({
      where: {
        shopifyDomain: 'shop-a.myshopify.com',
      },
      select: {
        id: true,
        sourceLocale: true,
      },
    });

    expect(prisma.glossaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          glossary: expect.objectContaining({
            shopId: 'shop-a',
            enabled: true,
          }),
        }),
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('italian');
    expect(result[0]?.targetTerm).toBe('Fatto a mano');
  });
});
