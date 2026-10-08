-- CreateEnum
CREATE TYPE "TranslationChangeEventAction" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "TranslationChangeEventStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "TranslationField" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TranslationResource" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TranslationChangeEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "shopifyResourceId" TEXT NOT NULL,
    "action" "TranslationChangeEventAction" NOT NULL,
    "status" "TranslationChangeEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "triggeredAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationChangeEvent_shopId_status_createdAt_idx" ON "TranslationChangeEvent"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationChangeEvent_shopId_resourceType_shopifyResourceI_idx" ON "TranslationChangeEvent"("shopId", "resourceType", "shopifyResourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationChangeEvent_shopId_webhookId_key" ON "TranslationChangeEvent"("shopId", "webhookId");

-- CreateIndex
CREATE INDEX "TranslationField_resourceId_deletedAt_idx" ON "TranslationField"("resourceId", "deletedAt");

-- CreateIndex
CREATE INDEX "TranslationResource_shopId_resourceType_deletedAt_idx" ON "TranslationResource"("shopId", "resourceType", "deletedAt");

-- AddForeignKey
ALTER TABLE "TranslationChangeEvent" ADD CONSTRAINT "TranslationChangeEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
