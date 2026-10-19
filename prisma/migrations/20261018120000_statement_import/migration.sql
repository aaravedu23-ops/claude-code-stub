-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "importKey" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- Entries with a receipt photo came from a scan.
UPDATE "Transaction" SET "source" = 'receipt' WHERE "receiptImage" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_importKey_key" ON "Transaction"("userId", "importKey");
