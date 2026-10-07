-- AlterEnum
ALTER TYPE "TranslationJobItemStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "TranslationJobItem" ADD COLUMN     "approvedValue" TEXT,
ADD COLUMN     "humanReviewNote" TEXT,
ADD COLUMN     "humanReviewedAt" TIMESTAMP(3);
