import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnDiary, getOwnEntry } from "@/lib/services/diary";
import { listReferenceData } from "@/lib/services/reference";
import { localized } from "@/lib/mapping/present";
import { toISODate } from "@/lib/campaigns/dates";
import { earliestEntryDate, entryToValues } from "@/lib/diary/present";
import { DiaryForm } from "@/components/DiaryForm";

export const dynamic = "force-dynamic";

/** Edit one of my own entries. Only my own entries open here; anyone else's looks like a missing page. */
export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { id } = await params;
  const diary = await getOwnDiary(user.actor);
  if (!diary || !diary.perms.edit) redirect("/diary?error=errDiaryNotOpen");
  const entry = await getOwnEntry(user.actor, id);
  const { systems, units } = await listReferenceData(user.actor, { participantView: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{entry.title}</h1>
      {diary.perms.confirm && diary.confirmed && <p className="rounded bg-surface p-3 text-sm">{t("editWithdrawsConfirmation")}</p>}
      <DiaryForm
        campaignId={diary.campaign.id}
        mode={entry.kind === "MEETING" ? "meeting" : "entry"}
        entryId={entry.id}
        source={entry.source}
        initial={entryToValues(entry)}
        activities={diary.activities.map((a) => ({ id: a.id, label: a.version.name, avgMinutes: a.version.avgDurationMinutes }))}
        systems={systems.map((s) => ({ id: s.id, label: s.name }))}
        units={units.map((u) => ({ id: u.id, label: localized(u, locale) }))}
        labels={messages[locale]}
        minDate={earliestEntryDate(diary.today, diary.campaign.retrospectiveWindowDays, toISODate(diary.campaign.startDate))}
        maxDate={diary.today}
        dateLocked={!diary.perms.create}
      />
    </div>
  );
}
