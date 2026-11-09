-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "OutputRecipient" AS ENUM ('MANAGER', 'OTHER_DEPARTMENT', 'CUSTOMER', 'AUTHORITY', 'EXTERNAL_PARTY', 'SYSTEM', 'SELF', 'UNKNOWN', 'OTHER');

-- CreateEnum
CREATE TYPE "AutomationLevel" AS ENUM ('MANUAL', 'PARTIAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "Degree" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ExceptionFrequency" AS ENUM ('RARE', 'OCCASIONAL', 'FREQUENT', 'ALMOST_EVERY_CASE', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "OccurrenceLevel" AS ENUM ('NONE', 'SOMETIMES', 'OFTEN');

-- CreateEnum
CREATE TYPE "Seasonality" AS ENUM ('EVEN', 'START_OF_MONTH', 'END_OF_MONTH', 'QUARTER_END', 'YEAR_END', 'OTHER');

-- CreateEnum
CREATE TYPE "SensitiveCategory" AS ENUM ('PERSONAL', 'HEALTH', 'FINANCIAL', 'CONFIDENTIAL', 'CREDENTIALS', 'OTHER', 'NONE');

-- AlterTable
ALTER TABLE "CampaignParticipant" ADD COLUMN     "mappingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameEt" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "belongsHere" TEXT NOT NULL,
    "notBelongsHere" TEXT NOT NULL,
    "boundaryExamples" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeUnit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameEt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VolumeUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemReference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SystemReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialActivity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitialActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialActivityVersion" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "outputRecipient" "OutputRecipient" NOT NULL,
    "primaryCategoryId" TEXT NOT NULL,
    "tags" TEXT[],
    "frequency" "Frequency" NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "avgDurationMinutes" INTEGER NOT NULL,
    "volume" DOUBLE PRECISION,
    "volumeUnitId" TEXT,
    "automationLevel" "AutomationLevel" NOT NULL,
    "ruleBasedDegree" "Degree" NOT NULL,
    "judgementDegree" "Degree" NOT NULL,
    "exceptionFrequency" "ExceptionFrequency" NOT NULL,
    "dataManuallyCopied" BOOLEAN NOT NULL,
    "needsInfoFromOthers" BOOLEAN NOT NULL,
    "waiting" "OccurrenceLevel" NOT NULL,
    "rework" "OccurrenceLevel" NOT NULL,
    "seasonality" "Seasonality" NOT NULL,
    "sensitiveData" "SensitiveCategory"[],
    "improvementOpportunity" BOOLEAN NOT NULL DEFAULT false,
    "employeeSuggestion" TEXT,

    CONSTRAINT "InitialActivityVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InitialActivityVersionToSystemReference" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InitialActivityVersionToSystemReference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityCategory_organizationId_departmentId_nameEn_key" ON "ActivityCategory"("organizationId", "departmentId", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeUnit_organizationId_key_key" ON "VolumeUnit"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemReference_organizationId_name_key" ON "SystemReference"("organizationId", "name");

-- CreateIndex
CREATE INDEX "InitialActivity_campaignId_participantId_idx" ON "InitialActivity"("campaignId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "InitialActivityVersion_activityId_versionNumber_key" ON "InitialActivityVersion"("activityId", "versionNumber");

-- CreateIndex
CREATE INDEX "_InitialActivityVersionToSystemReference_B_index" ON "_InitialActivityVersionToSystemReference"("B");

-- AddForeignKey
ALTER TABLE "ActivityCategory" ADD CONSTRAINT "ActivityCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeUnit" ADD CONSTRAINT "VolumeUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemReference" ADD CONSTRAINT "SystemReference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialActivity" ADD CONSTRAINT "InitialActivity_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "InitialActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "ActivityCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_volumeUnitId_fkey" FOREIGN KEY ("volumeUnitId") REFERENCES "VolumeUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InitialActivityVersionToSystemReference" ADD CONSTRAINT "_InitialActivityVersionToSystemReference_A_fkey" FOREIGN KEY ("A") REFERENCES "InitialActivityVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InitialActivityVersionToSystemReference" ADD CONSTRAINT "_InitialActivityVersionToSystemReference_B_fkey" FOREIGN KEY ("B") REFERENCES "SystemReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_duration_range" CHECK ("avgDurationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_occurrence_positive" CHECK ("occurrenceCount" >= 1);
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_volume_with_unit" CHECK (("volume" IS NULL) = ("volumeUnitId" IS NULL));
ALTER TABLE "InitialActivityVersion" ADD CONSTRAINT "InitialActivityVersion_no_sensitive_exclusive" CHECK (NOT ('NONE' = ANY("sensitiveData") AND cardinality("sensitiveData") > 1));
