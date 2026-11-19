CREATE TABLE "AiBudgetProfile" (
    "shopId" TEXT NOT NULL,
    "monthlyBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiBudgetProfile_pkey" PRIMARY KEY ("shopId")
);
ALTER TABLE "AiBudgetProfile" ADD CONSTRAINT "AiBudgetProfile_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
