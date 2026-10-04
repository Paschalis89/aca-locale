-- CreateTable
CREATE TABLE "ShopMarket" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyMarketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopMarket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopMarket_shopId_idx" ON "ShopMarket"("shopId");

-- CreateIndex
CREATE INDEX "ShopMarket_status_idx" ON "ShopMarket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMarket_shopId_shopifyMarketId_key" ON "ShopMarket"("shopId", "shopifyMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopMarket_shopId_handle_key" ON "ShopMarket"("shopId", "handle");

-- AddForeignKey
ALTER TABLE "ShopMarket" ADD CONSTRAINT "ShopMarket_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
