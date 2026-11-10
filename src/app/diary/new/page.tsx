import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnDiary, getOwnEntry } from "@/lib/services/diary";
import { listReferenceData } from "@/lib/services/reference";
import { localized, durationFormValues } from "@/lib/mapping/present";
import { toISODate } from "@/lib/campaigns/dates";
import { earliestEntryDate, logAgainValues, type FormValues } from "@/lib/diary/present";
import { DiaryForm } from "@/components/DiaryForm";

export const dynamic = "force-dynamic";

/**
 * A new entry. Favorites, Log Again and a stopped timer open this same lightweight form with
 * values filled in; the participant verifies and saves.
 */
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; from?: string; source?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { activity, from, source: sourceParam } = await searchParams;
  const diary = await getOwnDiary(user.actor);
  if (!diary || !diary.perms.create || diary.participant.status !== "ACTIVE" || !diary.acknowledged) redirect("/diary?error=errDiaryNotOpen");
  const { systems, units } = await listReferenceData(user.actor, { participantView: true });

  let initial: FormValues = { activityDate: diary.today, condition: "NORMAL", durationUnit: "minutes" };
  let source = "MANUAL";
  let notice: string | undefined;

  if (from) {
    const entry = await getOwnEntry(user.actor, from);
    initial = logAgainValues(entry, diary.today);
    source = "LOG_AGAIN";
    notice = t("logAgainNotice");
  } else if (activity) {
    const a = diary.activities.find((x) => x.id === activity);
    if (a) {
      initial = {
        ...initial,
        initialActivityId: a.id,
        ...durationFormValues(a.version.avgDurationMinutes),
        systemIds: a.version.systems.map((s) => s.id),
      };
      source = "FAVORITE";
      notice = t("favoriteNotice");
    }
  } else if (sourceParam === "TIMER") {
    const timer = diary.timer;
    if (!timer || !timer.stoppedAt) redirect("/diary/timer");
    initial = {
      ...initial,
      activityDate: toISODate(timer.startedAt) < diary.today ? toISODate(timer.startedAt) : diary.today,
      initialActivityId: timer.initialActivityId ?? "",
      title: timer.initialActivityId ? "" : timer.title,
      ...durationFormValues(timer.elapsed),
    };
    source = "TIMER";
    notice = `${t("timerReviewNotice")} ${timer.elapsed} ${t("minutesShort")}.${timer.warning ? ` ${t(timer.warning === "exceedsMax" ? "timerWarnMax" : "timerWarnActivity")}` : ""}`;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("logActivity")}</h1>
      <DiaryForm
        campaignId={diary.campaign.id}
        mode="entry"
        source={source}
        initial={initial}
        activities={diary.activities.map((a) => ({ id: a.id, label: a.version.name, avgMinutes: a.version.avgDurationMinutes }))}
        systems={systems.map((s) => ({ id: s.id, label: s.name }))}
        units={units.map((u) => ({ id: u.id, label: localized(u, locale) }))}
        labels={messages[locale]}
        minDate={earliestEntryDate(diary.today, diary.campaign.retrospectiveWindowDays, toISODate(diary.campaign.startDate))}
        maxDate={diary.today}
        notice={notice}
      />
    </div>
  );
}
