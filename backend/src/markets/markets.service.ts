import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

import type {
  ShopifyMarketDto,
} from './dto/sync-shopify-markets.dto.js';

@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async syncShopifyMarkets(
    shopifyDomain: string,
    markets: ShopifyMarketDto[],
  ) {
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

        const syncedMarketIds:
          string[] = [];

        for (const market of markets) {
          const saved =
            await tx.shopMarket.upsert({
              where: {
                shopId_shopifyMarketId: {
                  shopId:
                    shop.id,

                  shopifyMarketId:
                    market.id,
                },
              },

              update: {
                name:
                  market.name,

                handle:
                  market.handle,

                status:
                  market.status,

                type:
                  market.type,
              },

              create: {
                shopId:
                  shop.id,

                shopifyMarketId:
                  market.id,

                name:
                  market.name,

                handle:
                  market.handle,

                status:
                  market.status,

                type:
                  market.type,
              },
            });

          syncedMarketIds.push(
            saved.id,
          );
        }

        /*
         * Shopify is source of truth.
         *
         * If a market no longer exists on Shopify,
         * remove it from our local projection.
         */
        await tx.shopMarket.deleteMany({
          where: {
            shopId:
              shop.id,

            id: {
              notIn:
                syncedMarketIds,
            },
          },
        });

        return tx.shop.findUnique({
          where: {
            id:
              shop.id,
          },

          include: {
            markets: {
              orderBy: {
                name:
                  'asc',
              },
            },

            languages: {
              include: {
                language:
                  true,
              },
            },
          },
        });
      },
    );
  }

  findForShop(
    shopifyDomain: string,
  ) {
    return this.prisma.shopMarket.findMany({
      where: {
        shop: {
          shopifyDomain,
        },
      },

      orderBy: {
        name:
          'asc',
      },
    });
  }
}