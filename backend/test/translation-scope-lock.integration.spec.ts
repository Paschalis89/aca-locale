import { describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { lockTranslationScope } from '../src/translation-coordination/translation-scope-lock.js';

const connectionString = process.env.ACA_LOCK_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'ACA Locale PostgreSQL translation coordination',
  () => {
    it('serializes the same shop and locale using real Prisma transactions', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: connectionString! }),
      });

      let signalLocked!: () => void;
      let releaseFirst!: () => void;

      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });

      const release = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const shopId = 'aca-lock-integration-shop';
      const locale = 'en';

      try {
        const first = prisma.$transaction(
          async (tx) => {
            await lockTranslationScope(tx, shopId, locale);
            signalLocked();
            await release;
          },
          { maxWait: 10000, timeout: 30000 },
        );

        try {
          await locked;

          const second = await prisma.$transaction(
            async (tx) => {
              const sameScope = await tx.$queryRaw<
                { acquired: boolean }[]
              >`
                SELECT pg_try_advisory_xact_lock(
                  hashtext(${shopId}),
                  hashtext(${locale})
                ) AS acquired
              `;

              const differentLocale = await tx.$queryRaw<
                { acquired: boolean }[]
              >`
                SELECT pg_try_advisory_xact_lock(
                  hashtext(${shopId}),
                  hashtext(${'fr'})
                ) AS acquired
              `;

              return {
                same: sameScope[0]?.acquired,
                different: differentLocale[0]?.acquired,
              };
            },
            { maxWait: 10000, timeout: 30000 },
          );

          expect(second.same).toBe(false);
          expect(second.different).toBe(true);
        } finally {
          releaseFirst();
          await first;
        }

        const available = await prisma.$transaction(async (tx) => {
          const result = await tx.$queryRaw<
            { acquired: boolean }[]
          >`
            SELECT pg_try_advisory_xact_lock(
              hashtext(${shopId}),
              hashtext(${locale})
            ) AS acquired
          `;

          return result[0]?.acquired;
        });

        expect(available).toBe(true);
      } finally {
        await prisma.$disconnect();
      }
    }, 20000);
  },
);
