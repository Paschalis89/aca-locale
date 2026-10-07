-- AlterTable
ALTER TABLE "TranslationJobItem" ADD COLUMN     "regeneratedFromItemId" TEXT;

-- CreateIndex
CREATE INDEX "TranslationJobItem_regeneratedFromItemId_idx" ON "TranslationJobItem"("regeneratedFromItemId");

-- AddForeignKey
ALTER TABLE "TranslationJobItem" ADD CONSTRAINT "TranslationJobItem_regeneratedFromItemId_fkey" FOREIGN KEY ("regeneratedFromItemId") REFERENCES "TranslationJobItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
