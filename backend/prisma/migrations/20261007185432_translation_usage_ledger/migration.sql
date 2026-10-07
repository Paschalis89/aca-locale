-- CreateEnum
CREATE TYPE "TranslationUsageStage" AS ENUM ('TRANSLATION', 'AI_REVIEW');

-- CreateTable
CREATE TABLE "TranslationUsageEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "jobId" TEXT,
    "itemId" TEXT,
    "stage" "TranslationUsageStage" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "fallback" BOOLEAN NOT NULL DEFAULT false,
    "usageKnown" BOOLEAN NOT NULL DEFAULT true,
    "billedCharacters" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicrousd" INTEGER,
    "pricingKey" TEXT,
    "pricingVersion" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationUsageEvent_shopId_createdAt_idx" ON "TranslationUsageEvent"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationUsageEvent_jobId_createdAt_idx" ON "TranslationUsageEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationUsageEvent_itemId_createdAt_idx" ON "TranslationUsageEvent"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationUsageEvent_provider_createdAt_idx" ON "TranslationUsageEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationUsageEvent_stage_createdAt_idx" ON "TranslationUsageEvent"("stage", "createdAt");

-- AddForeignKey
ALTER TABLE "TranslationUsageEvent" ADD CONSTRAINT "TranslationUsageEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationUsageEvent" ADD CONSTRAINT "TranslationUsageEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationUsageEvent" ADD CONSTRAINT "TranslationUsageEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TranslationJobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
