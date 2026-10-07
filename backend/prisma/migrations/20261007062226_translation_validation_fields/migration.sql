-- AlterTable
ALTER TABLE "TranslationJobItem" ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validationErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validationIssues" JSONB,
ADD COLUMN     "validationPassed" BOOLEAN,
ADD COLUMN     "validationVersion" TEXT,
ADD COLUMN     "validationWarnings" INTEGER NOT NULL DEFAULT 0;
