-- CreateEnum
CREATE TYPE "DiaryCondition" AS ENUM ('NORMAL', 'WAITING', 'REWORK', 'PROBLEM');

-- CreateEnum
CREATE TYPE "DiarySource" AS ENUM ('MANUAL', 'TIMER', 'FAVORITE', 'LOG_AGAIN', 'QUICK_ADD', 'MEETING');

-- CreateEnum
CREATE TYPE "DiaryEntryKind" AS ENUM ('ACTIVITY', 'MEETING');

-- CreateEnum
CREATE TYPE "MeetingRecurrence" AS ENUM ('RECURRING', 'AD_HOC');

-- CreateEnum
CREATE TYPE "MeetingPurpose" AS ENUM ('INFORMATION_SHARING', 'DECISION_MAKING', 'PROBLEM_SOLVING', 'PLANNING', 'OTHER');

-- CreateTable
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "kind" "DiaryEntryKind" NOT NULL DEFAULT 'ACTIVITY',
    "activityDate" DATE NOT NULL,
    "initialActivityId" TEXT,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "volume" DOUBLE PRECISION,
    "volumeUnitId" TEXT,
    "condition" "DiaryCondition" NOT NULL DEFAULT 'NORMAL',
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "outOfScope" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "improvementOpportunity" BOOLEAN NOT NULL DEFAULT false,
    "employeeSuggestion" TEXT,
    "source" "DiarySource" NOT NULL DEFAULT 'MANUAL',
    "meetingRecurrence" "MeetingRecurrence",
    "meetingPurpose" "MeetingPurpose",
    "sharedMeetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedMeeting" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "recurrence" "MeetingRecurrence" NOT NULL,
    "purpose" "MeetingPurpose" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteActivity" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "initialActivityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryTimer" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "initialActivityId" TEXT,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "DiaryTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaryConfirmation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaryConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DiaryEntryToSystemReference" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DiaryEntryToSystemReference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "DiaryEntry_participantId_activityDate_idx" ON "DiaryEntry"("participantId", "activityDate");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_participantId_sharedMeetingId_key" ON "DiaryEntry"("participantId", "sharedMeetingId");

-- CreateIndex
CREATE INDEX "SharedMeeting_campaignId_meetingDate_idx" ON "SharedMeeting"("campaignId", "meetingDate");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteActivity_participantId_initialActivityId_key" ON "FavoriteActivity"("participantId", "initialActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryTimer_participantId_key" ON "DiaryTimer"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryConfirmation_participantId_key" ON "DiaryConfirmation"("participantId");

-- CreateIndex
CREATE INDEX "_DiaryEntryToSystemReference_B_index" ON "_DiaryEntryToSystemReference"("B");

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_initialActivityId_fkey" FOREIGN KEY ("initialActivityId") REFERENCES "InitialActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_volumeUnitId_fkey" FOREIGN KEY ("volumeUnitId") REFERENCES "VolumeUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_sharedMeetingId_fkey" FOREIGN KEY ("sharedMeetingId") REFERENCES "SharedMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteActivity" ADD CONSTRAINT "FavoriteActivity_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteActivity" ADD CONSTRAINT "FavoriteActivity_initialActivityId_fkey" FOREIGN KEY ("initialActivityId") REFERENCES "InitialActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryTimer" ADD CONSTRAINT "DiaryTimer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryConfirmation" ADD CONSTRAINT "DiaryConfirmation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CampaignParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiaryEntryToSystemReference" ADD CONSTRAINT "_DiaryEntryToSystemReference_A_fkey" FOREIGN KEY ("A") REFERENCES "DiaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiaryEntryToSystemReference" ADD CONSTRAINT "_DiaryEntryToSystemReference_B_fkey" FOREIGN KEY ("B") REFERENCES "SystemReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_duration_range" CHECK ("durationMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_times_together" CHECK (("startMinute" IS NULL) = ("endMinute" IS NULL) AND ("startMinute" IS NULL OR ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")));
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_volume_with_unit" CHECK (("volume" IS NULL) = ("volumeUnitId" IS NULL));
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_meeting_fields" CHECK ("kind" = 'ACTIVITY' OR ("meetingPurpose" IS NOT NULL AND "meetingRecurrence" IS NOT NULL));
ALTER TABLE "SharedMeeting" ADD CONSTRAINT "SharedMeeting_duration_range" CHECK ("durationMinutes" BETWEEN 1 AND 1440);
