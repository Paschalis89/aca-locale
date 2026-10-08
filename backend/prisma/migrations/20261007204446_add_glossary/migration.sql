-- CreateEnum
CREATE TYPE "GlossaryRuleType" AS ENUM ('DO_NOT_TRANSLATE', 'PREFERRED_TRANSLATION', 'FORBIDDEN_TRANSLATION');

-- CreateTable
CREATE TABLE "Glossary" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceLocale" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Glossary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" TEXT NOT NULL,
    "glossaryId" TEXT NOT NULL,
    "sourceTerm" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL DEFAULT '*',
    "targetTerm" TEXT,
    "ruleType" "GlossaryRuleType" NOT NULL,
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Glossary_shopId_enabled_idx" ON "Glossary"("shopId", "enabled");

-- CreateIndex
CREATE INDEX "Glossary_shopId_isDefault_idx" ON "Glossary"("shopId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Glossary_shopId_name_key" ON "Glossary"("shopId", "name");

-- CreateIndex
CREATE INDEX "GlossaryEntry_glossaryId_enabled_idx" ON "GlossaryEntry"("glossaryId", "enabled");

-- CreateIndex
CREATE INDEX "GlossaryEntry_targetLocale_ruleType_idx" ON "GlossaryEntry"("targetLocale", "ruleType");

-- CreateIndex
CREATE INDEX "GlossaryEntry_sourceTerm_idx" ON "GlossaryEntry"("sourceTerm");

-- CreateIndex
CREATE UNIQUE INDEX "GlossaryEntry_glossaryId_sourceTerm_targetLocale_ruleType_key" ON "GlossaryEntry"("glossaryId", "sourceTerm", "targetLocale", "ruleType");

-- AddForeignKey
ALTER TABLE "Glossary" ADD CONSTRAINT "Glossary_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_glossaryId_fkey" FOREIGN KEY ("glossaryId") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
