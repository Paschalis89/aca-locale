/*
  Warnings:

  - You are about to drop the column `fallbackModel` on the `TranslationJobItem` table. All the data in the column will be lost.
  - You are about to drop the column `fallbackProvider` on the `TranslationJobItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TranslationJob" ADD COLUMN     "fallbackModel" TEXT,
ADD COLUMN     "fallbackProvider" "TranslationProvider";

-- AlterTable
ALTER TABLE "TranslationJobItem" DROP COLUMN "fallbackModel",
DROP COLUMN "fallbackProvider";
