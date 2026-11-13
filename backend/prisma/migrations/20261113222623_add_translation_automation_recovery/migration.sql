-- AlterTable
ALTER TABLE "TranslationJob" ADD COLUMN     "automationCompletedAt" TIMESTAMP(3),
ADD COLUMN     "automationLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "automationLastError" TEXT,
ADD COLUMN     "automationNextRetryAt" TIMESTAMP(3),
ADD COLUMN     "automationStage" TEXT,
ADD COLUMN     "publishAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shopifyGatewayUrl" TEXT,
ADD COLUMN     "translationAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "TranslationJob_shopId_origin_automationStage_updatedAt_idx" ON "TranslationJob"("shopId", "origin", "automationStage", "updatedAt");
