-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNINSTALLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE');

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopifyDomain" TEXT NOT NULL,
    "name" TEXT,
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceLocale" TEXT NOT NULL DEFAULT 'it',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "autoTranslate" BOOLEAN NOT NULL DEFAULT false,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "requireHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "enableAiReview" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfiguration" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "translationProvider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "translationModel" TEXT,
    "reviewProvider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "reviewModel" TEXT,
    "fallbackProvider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
    "fallbackModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopifyDomain_key" ON "Shop"("shopifyDomain");

-- CreateIndex
CREATE INDEX "Shop_status_idx" ON "Shop"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopId_key" ON "ShopSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConfiguration_shopId_key" ON "AiConfiguration"("shopId");

-- AddForeignKey
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConfiguration" ADD CONSTRAINT "AiConfiguration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
