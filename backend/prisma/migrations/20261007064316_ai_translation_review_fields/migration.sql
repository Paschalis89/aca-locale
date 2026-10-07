-- AlterTable
ALTER TABLE "TranslationJob" ADD COLUMN     "reviewModel" TEXT,
ADD COLUMN     "reviewProvider" "AiProvider";

-- AlterTable
ALTER TABLE "TranslationJobItem" ADD COLUMN     "aiReviewIssues" JSONB,
ADD COLUMN     "aiReviewModel" TEXT,
ADD COLUMN     "aiReviewPassed" BOOLEAN,
ADD COLUMN     "aiReviewProvider" "AiProvider",
ADD COLUMN     "aiReviewScore" INTEGER,
ADD COLUMN     "aiReviewSuggestedTranslation" TEXT,
ADD COLUMN     "aiReviewedAt" TIMESTAMP(3);
