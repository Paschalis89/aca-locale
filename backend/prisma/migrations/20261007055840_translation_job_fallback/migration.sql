-- AlterTable
ALTER TABLE "TranslationJobItem" ADD COLUMN     "fallbackModel" TEXT,
ADD COLUMN     "fallbackProvider" "TranslationProvider",
ADD COLUMN     "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primaryErrorMessage" TEXT;
