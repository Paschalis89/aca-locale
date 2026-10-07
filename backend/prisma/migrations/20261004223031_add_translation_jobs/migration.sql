-- CreateEnum
CREATE TYPE "TranslationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TranslationJobItemStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'VALIDATED', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "status" "TranslationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" "AiProvider",
    "model" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "translatedValue" TEXT,
    "status" "TranslationJobItemStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "AiProvider",
    "model" TEXT,
    "generatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationJob_shopId_status_idx" ON "TranslationJob"("shopId", "status");

-- CreateIndex
CREATE INDEX "TranslationJob_shopId_targetLocale_idx" ON "TranslationJob"("shopId", "targetLocale");

-- CreateIndex
CREATE INDEX "TranslationJob_createdAt_idx" ON "TranslationJob"("createdAt");

-- CreateIndex
CREATE INDEX "TranslationJobItem_jobId_status_idx" ON "TranslationJobItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "TranslationJobItem_fieldId_idx" ON "TranslationJobItem"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationJobItem_jobId_fieldId_key" ON "TranslationJobItem"("jobId", "fieldId");

-- AddForeignKey
ALTER TABLE "TranslationJob" ADD CONSTRAINT "TranslationJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationJobItem" ADD CONSTRAINT "TranslationJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationJobItem" ADD CONSTRAINT "TranslationJobItem_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TranslationField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
