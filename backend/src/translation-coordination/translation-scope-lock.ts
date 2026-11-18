import type { Prisma, TranslationJobItemStatus } from '../generated/prisma/client.js';

/**
 * A cross-process, transaction-scoped PostgreSQL advisory lock.
 * Every ordinary job creator and human regeneration takes the same
 * shop/locale lock before reading candidate snapshots and creating jobs.
 */
export async function lockTranslationScope(
  tx: Prisma.TransactionClient,
  shopId: string,
  targetLocale: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM pg_advisory_xact_lock(
      hashtext(${shopId}), hashtext(${targetLocale})
    )
  `;
}

export const BLOCKING_TRANSLATION_ITEM_STATUSES: TranslationJobItemStatus[] = [
  'PENDING',
  'GENERATING',
  'GENERATED',
  'VALIDATED',
  'NEEDS_REVIEW',
  'APPROVED',
];
