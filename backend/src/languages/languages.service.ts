import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import type {
  ShopifyLocaleDto,
} from './dto/sync-shopify-locales.dto.js';

@Injectable()
export class LanguagesService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async syncShopifyLocales(
    shopifyDomain: string,
    locales: ShopifyLocaleDto[],
  ) {
    if (locales.length === 0) {
      throw new BadRequestException(
        'Shopify returned no locales.',
      );
    }

    const primaryLocales =
      locales.filter(
        (locale) => locale.primary,
      );

    if (primaryLocales.length !== 1) {
      throw new BadRequestException(
        'Exactly one primary Shopify locale is required.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const shop =
          await tx.shop.upsert({
            where: {
              shopifyDomain,
            },

            update: {},

            create: {
              shopifyDomain,

              settings: {
                create: {},
              },

              aiConfiguration: {
                create: {},
              },
            },
          });

        const syncedLanguageIds:
          string[] = [];

        for (const locale of locales) {
          const language =
            await tx.language.upsert({
              where: {
                locale:
                  locale.locale,
              },

              update: {
                name:
                  locale.name,
              },

              create: {
                locale:
                  locale.locale,

                name:
                  locale.name,
              },
            });

          syncedLanguageIds.push(
            language.id,
          );

          await tx.shopLanguage.upsert({
            where: {
              shopId_languageId: {
                shopId:
                  shop.id,

                languageId:
                  language.id,
              },
            },

            update: {
              primary:
                locale.primary,

              published:
                locale.published,
            },

            create: {
              shopId:
                shop.id,

              languageId:
                language.id,

              primary:
                locale.primary,

              published:
                locale.published,
            },
          });
        }

        await tx.shopLanguage.deleteMany({
          where: {
            shopId:
              shop.id,

            languageId: {
              notIn:
                syncedLanguageIds,
            },
          },
        });

        const primaryLocale =
          primaryLocales[0].locale;

        await tx.shop.update({
          where: {
            id:
              shop.id,
          },

          data: {
            sourceLocale:
              primaryLocale,
          },
        });

        return tx.shop.findUnique({
          where: {
            id:
              shop.id,
          },

          include: {
            languages: {
              include: {
                language:
                  true,
              },

              orderBy: {
                language: {
                  locale:
                    'asc',
                },
              },
            },
          },
        });
      },
    );
  }

  async findForShop(
    shopifyDomain: string,
  ) {
    return this.prisma.shopLanguage.findMany({
      where: {
        shop: {
          shopifyDomain,
        },
      },

      include: {
        language:
          true,
      },

      orderBy: {
        language: {
          locale:
            'asc',
        },
      },
    });
  }
}