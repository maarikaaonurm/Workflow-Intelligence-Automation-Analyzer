-- CreateEnum
CREATE TYPE "PeriodStartKind" AS ENUM ('INITIAL', 'LATE_JOIN', 'RESTORED');

-- CreateEnum
CREATE TYPE "RemovalMode" AS ENUM ('STOP_KEEP_DATA', 'EXCLUDE_DATA');

-- CreateTable
CREATE TABLE "CampaignParticipationPeriod" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "startedKind" "PeriodStartKind" NOT NULL,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactiveFrom" DATE,
    "endMode" "RemovalMode",
    "endedById" TEXT,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignParticipationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignParticipationPeriod_participantId_startDate_idx" ON "CampaignParticipationPeriod"("participantId", "startDate");

-- AddForeignKey
ALTER TABLE "CampaignParticipationPeriod" ADD CONSTRAINT "CampaignParticipationPeriod_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill one period per existing participant so campaigns created before this
-- migration keep their participation state and history.
INSERT INTO "CampaignParticipationPeriod" ("id", "participantId", "startDate", "startedKind", "startedAt", "inactiveFrom", "endMode", "endedById", "endedAt")
SELECT
  'bf_' || p."id",
  p."id",
  p."joinedAt",
  'INITIAL'::"PeriodStartKind",
  now(),
  CASE WHEN p."status" = 'ACTIVE' THEN NULL ELSE GREATEST(p."removedAt"::date, p."joinedAt") END,
  CASE p."status" WHEN 'STOPPED' THEN 'STOP_KEEP_DATA'::"RemovalMode" WHEN 'EXCLUDED' THEN 'EXCLUDE_DATA'::"RemovalMode" ELSE NULL END,
  p."removedById",
  p."removedAt"
FROM "CampaignParticipant" p;

-- At most one open (currently active) period per participant
CREATE UNIQUE INDEX "CampaignParticipationPeriod_one_open_per_participant" ON "CampaignParticipationPeriod"("participantId") WHERE "inactiveFrom" IS NULL;

ALTER TABLE "CampaignParticipationPeriod" ADD CONSTRAINT "CampaignParticipationPeriod_dates_ordered" CHECK ("inactiveFrom" IS NULL OR "inactiveFrom" >= "startDate");
ALTER TABLE "CampaignParticipationPeriod" ADD CONSTRAINT "CampaignParticipationPeriod_end_mode_with_end" CHECK (("inactiveFrom" IS NULL) = ("endMode" IS NULL));
