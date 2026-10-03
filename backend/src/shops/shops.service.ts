import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../database/prisma.service.js';

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

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
        shopifyDomain:
          'aca-locale-dev-cfoxunuo.myshopify.com',
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
        shopifyDomain:
          'aca-locale-dev-cfoxunuo.myshopify.com',

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

  ensureShop(
    shopifyDomain: string,
    ) {
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
}