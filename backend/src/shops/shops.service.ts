import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.shop.findMany({
      include: {
        settings: true,
        aiConfiguration: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  bootstrapAcaLocaleDev() {
    return this.prisma.shop.upsert({
      where: {
        shopifyDomain: 'aca-locale-dev-cfoxunuo.myshopify.com',
      },

      update: {
        name: 'ACA Locale Dev',

        status: 'ACTIVE',

        uninstalledAt: null,

        settings: {
          upsert: {
            create: {},
            update: {},
          },
        },

        aiConfiguration: {
          upsert: {
            create: {},
            update: {},
          },
        },
      },

      create: {
        shopifyDomain: 'aca-locale-dev-cfoxunuo.myshopify.com',

        name: 'ACA Locale Dev',

        sourceLocale: 'it',

        settings: {
          create: {},
        },

        aiConfiguration: {
          create: {},
        },
      },

      include: {
        settings: true,
        aiConfiguration: true,
      },
    });
  }

  ensureShop(shopifyDomain: string) {
    return this.prisma.shop.upsert({
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

      include: {
        settings: true,
        aiConfiguration: true,
      },
    });
  }

  syncIdentity(
    shopifyDomain: string,
    identity: {
      id: string;
      name: string;
      currencyCode: string;
      ianaTimezone: string;

      primaryDomain: {
        host: string;
        url: string;
      };
    },
  ) {
    return this.prisma.shop.upsert({
      where: {
        shopifyDomain,
      },

      update: {
        shopifyShopId: identity.id,

        name: identity.name,

        currencyCode: identity.currencyCode,

        ianaTimezone: identity.ianaTimezone,

        primaryDomainHost: identity.primaryDomain.host,

        primaryDomainUrl: identity.primaryDomain.url,

        status: 'ACTIVE',

        uninstalledAt: null,
      },

      create: {
        shopifyDomain,

        shopifyShopId: identity.id,

        name: identity.name,

        currencyCode: identity.currencyCode,

        ianaTimezone: identity.ianaTimezone,

        primaryDomainHost: identity.primaryDomain.host,

        primaryDomainUrl: identity.primaryDomain.url,

        settings: {
          create: {},
        },

        aiConfiguration: {
          create: {},
        },
      },
    });
  }

  findConfiguration(shopifyDomain: string) {
    return this.prisma.shop.findUnique({
      where: {
        shopifyDomain,
      },

      include: {
        settings: true,

        aiConfiguration: true,

        languages: {
          include: {
            language: true,
          },

          orderBy: {
            language: {
              locale: 'asc',
            },
          },
        },

        markets: {
          orderBy: {
            name: 'asc',
          },
        },
      },
    });
  }
}
