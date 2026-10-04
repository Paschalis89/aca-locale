-- CreateEnum
CREATE TYPE "TranslationStateStatus" AS ENUM ('EMPTY_SOURCE', 'MISSING', 'TRANSLATED', 'OUTDATED');

-- CreateTable
CREATE TABLE "TranslationResource" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyResourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationField" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationState" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "status" "TranslationStateStatus" NOT NULL,
    "translatedValue" TEXT,
    "translationUpdatedAt" TIMESTAMP(3),
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranslationResource_shopId_resourceType_idx" ON "TranslationResource"("shopId", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationResource_shopId_resourceType_shopifyResourceId_key" ON "TranslationResource"("shopId", "resourceType", "shopifyResourceId");

-- CreateIndex
CREATE INDEX "TranslationField_resourceId_idx" ON "TranslationField"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationField_resourceId_key_key" ON "TranslationField"("resourceId", "key");

-- CreateIndex
CREATE INDEX "TranslationState_targetLocale_status_idx" ON "TranslationState"("targetLocale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationState_fieldId_targetLocale_key" ON "TranslationState"("fieldId", "targetLocale");

-- AddForeignKey
ALTER TABLE "TranslationResource" ADD CONSTRAINT "TranslationResource_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationField" ADD CONSTRAINT "TranslationField_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "TranslationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationState" ADD CONSTRAINT "TranslationState_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TranslationField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
