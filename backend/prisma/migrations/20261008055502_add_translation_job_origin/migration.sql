/*
  Warnings:

  - A unique constraint covering the columns `[automationKey]` on the table `TranslationJob` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TranslationJobOrigin" AS ENUM ('MANUAL', 'SHOPIFY_CHANGE');

-- AlterTable
ALTER TABLE "TranslationJob" ADD COLUMN     "automationKey" TEXT,
ADD COLUMN     "changeEventId" TEXT,
ADD COLUMN     "origin" "TranslationJobOrigin" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "TranslationJob_automationKey_key" ON "TranslationJob"("automationKey");

-- CreateIndex
CREATE INDEX "TranslationJob_shopId_origin_createdAt_idx" ON "TranslationJob"("shopId", "origin", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationJob_changeEventId_idx" ON "TranslationJob"("changeEventId");

-- AddForeignKey
ALTER TABLE "TranslationJob" ADD CONSTRAINT "TranslationJob_changeEventId_fkey" FOREIGN KEY ("changeEventId") REFERENCES "TranslationChangeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
