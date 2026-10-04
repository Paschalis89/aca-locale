-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopLanguage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Language_locale_key" ON "Language"("locale");

-- CreateIndex
CREATE INDEX "ShopLanguage_shopId_idx" ON "ShopLanguage"("shopId");

-- CreateIndex
CREATE INDEX "ShopLanguage_languageId_idx" ON "ShopLanguage"("languageId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLanguage_shopId_languageId_key" ON "ShopLanguage"("shopId", "languageId");

-- AddForeignKey
ALTER TABLE "ShopLanguage" ADD CONSTRAINT "ShopLanguage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLanguage" ADD CONSTRAINT "ShopLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
