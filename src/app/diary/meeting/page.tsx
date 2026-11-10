import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnDiary } from "@/lib/services/diary";
import { toISODate } from "@/lib/campaigns/dates";
import { earliestEntryDate } from "@/lib/diary/present";
import { DiaryForm } from "@/components/DiaryForm";

export const dynamic = "force-dynamic";

/** Meetings are their own kind of entry: no category, no performance score, no efficiency measure. */
export default async function MeetingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const diary = await getOwnDiary(user.actor);
  if (!diary || !diary.perms.create || diary.participant.status !== "ACTIVE" || !diary.acknowledged) redirect("/diary?error=errDiaryNotOpen");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("logMeeting")}</h1>
      <DiaryForm
        campaignId={diary.campaign.id}
        mode="meeting"
        source="MEETING"
        initial={{ activityDate: diary.today, durationUnit: "minutes" }}
        activities={[]}
        systems={[]}
        units={[]}
        labels={messages[locale]}
        minDate={earliestEntryDate(diary.today, diary.campaign.retrospectiveWindowDays, toISODate(diary.campaign.startDate))}
        maxDate={diary.today}
      />
    </div>
  );
}
