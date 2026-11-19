CREATE TABLE "UsagePricingProfile" (
  "shopId" TEXT NOT NULL PRIMARY KEY,
  "rules" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsagePricingProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "UsagePricingRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shopId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "rules" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsagePricingRevision_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UsagePricingRevision_shopId_version_key" ON "UsagePricingRevision"("shopId", "version");
CREATE INDEX "UsagePricingRevision_shopId_createdAt_idx" ON "UsagePricingRevision"("shopId", "createdAt");
