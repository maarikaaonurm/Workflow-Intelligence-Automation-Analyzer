-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'INITIAL_MAPPING', 'ACTIVE', 'REVIEW_WINDOW', 'LOCKED', 'ANALYSIS_IN_PROGRESS', 'MANAGER_REVIEW', 'FINAL', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'STOPPED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "AnalysisCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reviewWindowDays" INTEGER NOT NULL DEFAULT 2,
    "retrospectiveWindowDays" INTEGER NOT NULL DEFAULT 3,
    "reminderTime" TEXT NOT NULL DEFAULT '16:00',
    "reminderMessage" TEXT NOT NULL DEFAULT 'Check whether today''s material activities have been recorded.',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "retentionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATE NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignParticipantExcludedDate" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignParticipantExcludedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAcknowledgement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPreference" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReminderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisCampaign_departmentId_status_idx" ON "AnalysisCampaign"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignParticipant_campaignId_userId_key" ON "CampaignParticipant"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignParticipantExcludedDate_participantId_date_key" ON "CampaignParticipantExcludedDate"("participantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAcknowledgement_campaignId_userId_key" ON "CampaignAcknowledgement"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderPreference_campaignId_userId_key" ON "ReminderPreference"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "AnalysisCampaign" ADD CONSTRAINT "AnalysisCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCampaign" ADD CONSTRAINT "AnalysisCampaign_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AnalysisCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignParticipantExcludedDate" ADD CONSTRAINT "CampaignParticipantExcludedDate_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAcknowledgement" ADD CONSTRAINT "CampaignAcknowledgement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AnalysisCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAcknowledgement" ADD CONSTRAINT "CampaignAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AnalysisCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPreference" ADD CONSTRAINT "ReminderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A department may have only one campaign occupying the observation slot at a time
CREATE UNIQUE INDEX "AnalysisCampaign_one_active_per_department" ON "AnalysisCampaign"("departmentId") WHERE "status" IN ('INITIAL_MAPPING', 'ACTIVE', 'REVIEW_WINDOW');

ALTER TABLE "AnalysisCampaign" ADD CONSTRAINT "AnalysisCampaign_review_window_range" CHECK ("reviewWindowDays" BETWEEN 0 AND 5);
ALTER TABLE "AnalysisCampaign" ADD CONSTRAINT "AnalysisCampaign_dates_ordered" CHECK ("endDate" >= "startDate");
