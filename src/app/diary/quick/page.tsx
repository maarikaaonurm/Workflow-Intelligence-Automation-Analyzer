import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnDiary } from "@/lib/services/diary";
import { listReferenceData } from "@/lib/services/reference";
import { localized } from "@/lib/mapping/present";
import { toISODate } from "@/lib/campaigns/dates";
import { earliestEntryDate } from "@/lib/diary/present";
import { QuickAddForm } from "@/components/QuickAddForm";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const diary = await getOwnDiary(user.actor);
  if (!diary || !diary.perms.create || diary.participant.status !== "ACTIVE" || !diary.acknowledged) redirect("/diary?error=errDiaryNotOpen");
  const { units } = await listReferenceData(user.actor, { participantView: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("quickAdd")}</h1>
      <p className="text-sm text-gray-600">{t("quickHelp")}</p>
      <QuickAddForm
        campaignId={diary.campaign.id}
        activities={diary.activities.map((a) => ({ id: a.id, label: a.version.name, avgMinutes: a.version.avgDurationMinutes }))}
        units={units.map((u) => ({ id: u.id, label: localized(u, locale) }))}
        labels={messages[locale]}
        today={diary.today}
        minDate={earliestEntryDate(diary.today, diary.campaign.retrospectiveWindowDays, toISODate(diary.campaign.startDate))}
      />
    </div>
  );
}
