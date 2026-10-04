/*
  Warnings:

  - A unique constraint covering the columns `[shopifyShopId]` on the table `Shop` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "ianaTimezone" TEXT,
ADD COLUMN     "primaryDomainHost" TEXT,
ADD COLUMN     "primaryDomainUrl" TEXT,
ADD COLUMN     "shopifyShopId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopifyShopId_key" ON "Shop"("shopifyShopId");
