import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import type {
  CreateGlossaryDto,
} from './dto/create-glossary.dto.js';

import type {
  UpdateGlossaryDto,
} from './dto/update-glossary.dto.js';

import type {
  CreateGlossaryEntryDto,
  GlossaryRuleTypeValue,
} from './dto/create-glossary-entry.dto.js';

import type {
  UpdateGlossaryEntryDto,
} from './dto/update-glossary-entry.dto.js';

import {
  glossaryLocaleCandidates,
  selectGlossaryRulesForText,
} from './glossary-rule.utils.js';

import type {
  ResolvedGlossaryRule,
} from './glossary.types.js';

@Injectable()
export class GlossaryService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async list(
    shopifyDomain:
      string,
  ) {
    const shop =
      await this.findShop(
        shopifyDomain,
      );

    return this.prisma.glossary.findMany({
      where: {
        shopId:
          shop.id,
      },

      include: {
        entries: {
          orderBy: [
            {
              sourceTerm:
                'asc',
            },
            {
              targetLocale:
                'asc',
            },
          ],
        },
      },

      orderBy: [
        {
          isDefault:
            'desc',
        },
        {
          name:
            'asc',
        },
      ],
    });
  }

  async getDefault(
    shopifyDomain:
      string,
  ) {
    const shop =
      await this.findShop(
        shopifyDomain,
      );

    let glossary =
      await this.prisma.glossary.findFirst({
        where: {
          shopId:
            shop.id,

          isDefault:
            true,
        },

        include: {
          entries: {
            orderBy: [
              {
                sourceTerm:
                  'asc',
              },
              {
                targetLocale:
                  'asc',
              },
            ],
          },
        },
      });

    if (
      glossary
    ) {
      return glossary;
    }

    try {
      glossary =
        await this.prisma.glossary.create({
          data: {
            shopId:
              shop.id,

            name:
              'Master Glossary',

            description:
              'Primary terminology and brand rules used by ACA Locale.',

            sourceLocale:
              shop.sourceLocale ??
              'en',

            isDefault:
              true,

            enabled:
              true,
          },

          include: {
            entries:
              true,
          },
        });

      return glossary;
    } catch {
      const existing =
        await this.prisma.glossary.findFirst({
          where: {
            shopId:
              shop.id,

            isDefault:
              true,
          },

          include: {
            entries: {
              orderBy: {
                sourceTerm:
                  'asc',
              },
            },
          },
        });

      if (
        existing
      ) {
        return existing;
      }

      throw new ConflictException(
        'Unable to create the default glossary.',
      );
    }
  }


  async resolveRulesForText(
    shopifyDomain:
      string,

    sourceLocale:
      string,

    targetLocale:
      string,

    sourceValue:
      string,
  ): Promise<ResolvedGlossaryRule[]> {
    const shop =
      await this.findShop(
        shopifyDomain,
      );

    const sourceLocales =
      glossaryLocaleCandidates(
        sourceLocale,
      );

    const targetLocales = [
      ...glossaryLocaleCandidates(
        targetLocale,
      ),
      '*',
    ];

    const entries =
      await this.prisma.glossaryEntry.findMany({
        where: {
          enabled:
            true,

          targetLocale: {
            in:
              Array.from(
                new Set(
                  targetLocales,
                ),
              ),
          },

          glossary: {
            shopId:
              shop.id,

            enabled:
              true,

            sourceLocale: {
              in:
                sourceLocales,
            },
          },
        },

        include: {
          glossary: {
            select: {
              id:
                true,

              name:
                true,

              isDefault:
                true,
            },
          },
        },
      });

    const rules =
      entries
        .sort(
          (left, right) =>
            Number(
              right.glossary.isDefault,
            ) -
            Number(
              left.glossary.isDefault,
            ),
        )
        .map(
          (entry): ResolvedGlossaryRule => ({
            id:
              entry.id,

            glossaryId:
              entry.glossary.id,

            glossaryName:
              entry.glossary.name,

            sourceTerm:
              entry.sourceTerm,

            targetLocale:
              entry.targetLocale,

            targetTerm:
              entry.targetTerm,

            ruleType:
              entry.ruleType,

            caseSensitive:
              entry.caseSensitive,

            notes:
              entry.notes,
          }),
        );

    return selectGlossaryRulesForText(
      rules,
      sourceValue,
      targetLocale,
    );
  }

  async findOne(
    shopifyDomain:
      string,

    glossaryId:
      string,
  ) {
    const glossary =
      await this.prisma.glossary.findFirst({
        where: {
          id:
            glossaryId,

          shop: {
            shopifyDomain,
          },
        },

        include: {
          entries: {
            orderBy: [
              {
                sourceTerm:
                  'asc',
              },
              {
                targetLocale:
                  'asc',
              },
            ],
          },
        },
      });

    if (
      !glossary
    ) {
      throw new NotFoundException(
        'Glossary not found.',
      );
    }

    return glossary;
  }

  async create(
    shopifyDomain:
      string,

    body:
      CreateGlossaryDto,
  ) {
    const shop =
      await this.findShop(
        shopifyDomain,
      );

    const name =
      this.requiredText(
        body.name,
        'Glossary name',
      );

    const sourceLocale =
      this.normalizeLocale(
        body.sourceLocale,
        false,
      );

    const existingCount =
      await this.prisma.glossary.count({
        where: {
          shopId:
            shop.id,
        },
      });

    const duplicate =
      await this.prisma.glossary.findFirst({
        where: {
          shopId:
            shop.id,

          name,
        },

        select: {
          id:
            true,
        },
      });

    if (
      duplicate
    ) {
      throw new ConflictException(
        `A glossary named "${name}" already exists.`,
      );
    }

    return this.prisma.glossary.create({
      data: {
        shopId:
          shop.id,

        name,

        description:
          this.optionalText(
            body.description,
          ),

        sourceLocale,

        enabled:
          body.enabled ??
          true,

        isDefault:
          existingCount ===
          0,
      },

      include: {
        entries:
          true,
      },
    });
  }

  async update(
    shopifyDomain:
      string,

    glossaryId:
      string,

    body:
      UpdateGlossaryDto,
  ) {
    const glossary =
      await this.findOne(
        shopifyDomain,
        glossaryId,
      );

    const name =
      body.name ===
      undefined
        ? glossary.name
        : this.requiredText(
            body.name,
            'Glossary name',
          );

    const duplicate =
      await this.prisma.glossary.findFirst({
        where: {
          shopId:
            glossary.shopId,

          name,

          id: {
            not:
              glossary.id,
          },
        },

        select: {
          id:
            true,
        },
      });

    if (
      duplicate
    ) {
      throw new ConflictException(
        `A glossary named "${name}" already exists.`,
      );
    }

    return this.prisma.glossary.update({
      where: {
        id:
          glossary.id,
      },

      data: {
        ...(body.name !== undefined
          ? {
              name,
            }
          : {}),

        ...(body.description !== undefined
          ? {
              description:
                this.optionalText(
                  body.description,
                ),
            }
          : {}),

        ...(body.sourceLocale !== undefined
          ? {
              sourceLocale:
                this.normalizeLocale(
                  body.sourceLocale,
                  false,
                ),
            }
          : {}),

        ...(body.enabled !== undefined
          ? {
              enabled:
                body.enabled,
            }
          : {}),
      },

      include: {
        entries: {
          orderBy: {
            sourceTerm:
              'asc',
          },
        },
      },
    });
  }

  async remove(
    shopifyDomain:
      string,

    glossaryId:
      string,
  ) {
    const glossary =
      await this.findOne(
        shopifyDomain,
        glossaryId,
      );

    await this.prisma.glossary.delete({
      where: {
        id:
          glossary.id,
      },
    });

    return {
      deleted:
        true,

      id:
        glossary.id,
    };
  }

  async createDefaultEntry(
    shopifyDomain:
      string,

    body:
      CreateGlossaryEntryDto,
  ) {
    const glossary =
      await this.getDefault(
        shopifyDomain,
      );

    return this.createEntryForGlossary(
      glossary.id,
      body,
    );
  }

  async createEntry(
    shopifyDomain:
      string,

    glossaryId:
      string,

    body:
      CreateGlossaryEntryDto,
  ) {
    const glossary =
      await this.findOne(
        shopifyDomain,
        glossaryId,
      );

    return this.createEntryForGlossary(
      glossary.id,
      body,
    );
  }

  async updateDefaultEntry(
    shopifyDomain:
      string,

    entryId:
      string,

    body:
      UpdateGlossaryEntryDto,
  ) {
    const glossary =
      await this.getDefault(
        shopifyDomain,
      );

    return this.updateEntryForGlossary(
      glossary.id,
      entryId,
      body,
    );
  }

  async updateEntry(
    shopifyDomain:
      string,

    glossaryId:
      string,

    entryId:
      string,

    body:
      UpdateGlossaryEntryDto,
  ) {
    const glossary =
      await this.findOne(
        shopifyDomain,
        glossaryId,
      );

    return this.updateEntryForGlossary(
      glossary.id,
      entryId,
      body,
    );
  }

  async removeDefaultEntry(
    shopifyDomain:
      string,

    entryId:
      string,
  ) {
    const glossary =
      await this.getDefault(
        shopifyDomain,
      );

    return this.removeEntryForGlossary(
      glossary.id,
      entryId,
    );
  }

  async removeEntry(
    shopifyDomain:
      string,

    glossaryId:
      string,

    entryId:
      string,
  ) {
    const glossary =
      await this.findOne(
        shopifyDomain,
        glossaryId,
      );

    return this.removeEntryForGlossary(
      glossary.id,
      entryId,
    );
  }

  private async createEntryForGlossary(
    glossaryId:
      string,

    body:
      CreateGlossaryEntryDto,
  ) {
    const normalized =
      this.normalizeEntry(
        body,
      );

    await this.ensureEntryUnique(
      glossaryId,
      normalized.sourceTerm,
      normalized.targetLocale,
      normalized.ruleType,
    );

    return this.prisma.glossaryEntry.create({
      data: {
        glossaryId,
        ...normalized,
      },
    });
  }

  private async updateEntryForGlossary(
    glossaryId:
      string,

    entryId:
      string,

    body:
      UpdateGlossaryEntryDto,
  ) {
    const entry =
      await this.prisma.glossaryEntry.findFirst({
        where: {
          id:
            entryId,

          glossaryId,
        },
      });

    if (
      !entry
    ) {
      throw new NotFoundException(
        'Glossary entry not found.',
      );
    }

    const normalized =
      this.normalizeEntry({
        sourceTerm:
          body.sourceTerm ??
          entry.sourceTerm,

        targetLocale:
          body.targetLocale ??
          entry.targetLocale,

        targetTerm:
          body.targetTerm !==
          undefined
            ? body.targetTerm
            : entry.targetTerm,

        ruleType:
          body.ruleType ??
          entry.ruleType,

        caseSensitive:
          body.caseSensitive ??
          entry.caseSensitive,

        notes:
          body.notes !==
          undefined
            ? body.notes
            : entry.notes,

        enabled:
          body.enabled ??
          entry.enabled,
      });

    await this.ensureEntryUnique(
      glossaryId,
      normalized.sourceTerm,
      normalized.targetLocale,
      normalized.ruleType,
      entry.id,
    );

    return this.prisma.glossaryEntry.update({
      where: {
        id:
          entry.id,
      },

      data:
        normalized,
    });
  }

  private async removeEntryForGlossary(
    glossaryId:
      string,

    entryId:
      string,
  ) {
    const entry =
      await this.prisma.glossaryEntry.findFirst({
        where: {
          id:
            entryId,

          glossaryId,
        },

        select: {
          id:
            true,
        },
      });

    if (
      !entry
    ) {
      throw new NotFoundException(
        'Glossary entry not found.',
      );
    }

    await this.prisma.glossaryEntry.delete({
      where: {
        id:
          entry.id,
      },
    });

    return {
      deleted:
        true,

      id:
        entry.id,
    };
  }

  private normalizeEntry(
    input: {
      sourceTerm: string;
      targetLocale?: string;
      targetTerm?: string | null;
      ruleType: GlossaryRuleTypeValue | string;
      caseSensitive?: boolean;
      notes?: string | null;
      enabled?: boolean;
    },
  ) {
    const sourceTerm =
      this.requiredText(
        input.sourceTerm,
        'Source term',
      );

    const targetLocale =
      this.normalizeLocale(
        input.targetLocale ??
        '*',
        true,
      );

    const ruleType =
      input.ruleType as
        GlossaryRuleTypeValue;

    let targetTerm =
      this.optionalText(
        input.targetTerm,
      );

    if (
      ruleType ===
      'DO_NOT_TRANSLATE'
    ) {
      targetTerm =
        null;
    }

    if (
      ruleType ===
        'PREFERRED_TRANSLATION' &&
      !targetTerm
    ) {
      throw new BadRequestException(
        'Preferred translation rules require a target term.',
      );
    }

    if (
      ruleType ===
        'FORBIDDEN_TRANSLATION' &&
      !targetTerm
    ) {
      throw new BadRequestException(
        'Forbidden translation rules require the forbidden target term.',
      );
    }

    return {
      sourceTerm,
      targetLocale,
      targetTerm,
      ruleType,

      caseSensitive:
        input.caseSensitive ??
        false,

      notes:
        this.optionalText(
          input.notes,
        ),

      enabled:
        input.enabled ??
        true,
    };
  }

  private async ensureEntryUnique(
    glossaryId:
      string,

    sourceTerm:
      string,

    targetLocale:
      string,

    ruleType:
      string,

    excludeEntryId?:
      string,
  ) {
    const duplicate =
      await this.prisma.glossaryEntry.findFirst({
        where: {
          glossaryId,
          sourceTerm,
          targetLocale,
          ruleType:
            ruleType as never,

          ...(excludeEntryId
            ? {
                id: {
                  not:
                    excludeEntryId,
                },
              }
            : {}),
        },

        select: {
          id:
            true,
        },
      });

    if (
      duplicate
    ) {
      throw new ConflictException(
        'An equivalent glossary rule already exists.',
      );
    }
  }

  private async findShop(
    shopifyDomain:
      string,
  ) {
    const shop =
      await this.prisma.shop.findUnique({
        where: {
          shopifyDomain,
        },

        select: {
          id:
            true,

          sourceLocale:
            true,
        },
      });

    if (
      !shop
    ) {
      throw new NotFoundException(
        'Shop is not registered.',
      );
    }

    return shop;
  }

  private requiredText(
    value:
      string,

    label:
      string,
  ) {
    const trimmed =
      value.trim();

    if (
      !trimmed
    ) {
      throw new BadRequestException(
        `${label} cannot be empty.`,
      );
    }

    return trimmed;
  }

  private optionalText(
    value:
      string |
      null |
      undefined,
  ) {
    if (
      value ===
      null ||
      value ===
      undefined
    ) {
      return null;
    }

    const trimmed =
      value.trim();

    return trimmed ||
      null;
  }

  private normalizeLocale(
    value:
      string,

    allowWildcard:
      boolean,
  ) {
    const locale =
      value
        .trim()
        .toLowerCase();

    if (
      allowWildcard &&
      locale ===
      '*'
    ) {
      return '*';
    }

    if (
      !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(
        locale,
      )
    ) {
      throw new BadRequestException(
        `Invalid locale "${value}".`,
      );
    }

    return locale;
  }
}
