-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('DIRECT', 'IMPORT');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('COMPLETED');

-- AlterTable
ALTER TABLE "CampaignParticipant" ADD COLUMN     "mappingBaselineActivityCount" INTEGER,
ADD COLUMN     "mappingBaselineHash" TEXT;

-- AlterTable
ALTER TABLE "ActivityCategory" ADD COLUMN     "belongsHereEt" TEXT,
ADD COLUMN     "boundaryExamplesEt" TEXT,
ADD COLUMN     "definitionEt" TEXT,
ADD COLUMN     "notBelongsHereEt" TEXT;

-- AlterTable
ALTER TABLE "InitialActivity" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "source" "ActivitySource" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "InitialActivityVersion" ADD COLUMN     "outputRecipientNote" TEXT;

-- CreateTable
CREATE TABLE "InitialMappingImportBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'COMPLETED',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateVersion" TEXT NOT NULL,
    "templateLanguage" TEXT NOT NULL,
    "sourceFilename" TEXT,
    "rowCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,

    CONSTRAINT "InitialMappingImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InitialMappingImportBatch_participantId_contentHash_idx" ON "InitialMappingImportBatch"("participantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "InitialMappingImportBatch_participantId_idempotencyKey_key" ON "InitialMappingImportBatch"("participantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "InitialActivity" ADD CONSTRAINT "InitialActivity_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "InitialMappingImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialMappingImportBatch" ADD CONSTRAINT "InitialMappingImportBatch_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "InitialMappingImportBatch" ADD CONSTRAINT "InitialMappingImportBatch_counts_valid" CHECK ("rowCount" >= 0 AND "successCount" >= 0 AND "warningCount" >= 0 AND "errorCount" >= 0 AND "successCount" <= "rowCount");
