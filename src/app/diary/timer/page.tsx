import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOwnDiary } from "@/lib/services/diary";
import { ErrorBanner } from "@/components/ErrorBanner";
import { startTimerAction, stopTimerAction } from "../../diary-actions";

export const dynamic = "force-dynamic";

const primary = "rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark";
const secondary = "rounded border border-primary px-4 py-2 text-primary";

/** Start, stop and discard. The timer lives on the server and is never stopped automatically. */
export default async function TimerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t } = await getT();
  const { error } = await searchParams;
  const diary = await getOwnDiary(user.actor);
  if (!diary) redirect("/diary");
  const canStart = diary.perms.create && diary.participant.status === "ACTIVE" && diary.acknowledged;
  const { timer } = diary;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("timer")}</h1>
      <ErrorBanner code={error} t={t} />

      {timer ? (
        <section className="space-y-3 rounded border border-gray-200 p-4">
          <p className="text-lg font-medium">{timer.title}</p>
          <p className="text-sm text-gray-600">
            {t("timerStarted")}: {timer.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {t("timerElapsed")}: {timer.elapsed} {t("minutesShort")}
            {timer.stoppedAt ? ` · ${t("timerStopped")}` : ""}
          </p>
          {timer.warning && (
            <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              {t(timer.warning === "exceedsMax" ? "timerWarnMax" : "timerWarnActivity")}
            </p>
          )}
          <p className="text-xs text-gray-500">{t("timerNeverAuto")}</p>
          <div className="flex flex-wrap gap-3">
            {timer.stoppedAt ? (
              <Link href="/diary/new?source=TIMER" className={primary}>{t("timerReview")}</Link>
            ) : (
              <form action={stopTimerAction}>
                <input type="hidden" name="campaignId" value={diary.campaign.id} />
                <button className={primary}>{t("timerStop")}</button>
              </form>
            )}
            <Link href="/diary/confirm?action=discardTimer" className={secondary}>{t("timerDiscard")}</Link>
          </div>
        </section>
      ) : canStart ? (
        <form action={startTimerAction} className="space-y-3 rounded border border-gray-200 p-4 text-sm">
          <input type="hidden" name="campaignId" value={diary.campaign.id} />
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("dfield_initialActivityId")}</span>
            <select name="initialActivityId" defaultValue="" className="rounded border border-gray-300 px-2 py-1">
              <option value="">{t("newActivityOption")}</option>
              {diary.activities.map((a) => (
                <option key={a.id} value={a.id}>{a.version.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">{t("dfield_title")}</span>
            <input name="title" maxLength={150} className="rounded border border-gray-300 px-2 py-1" />
            <span className="text-xs text-gray-500">{t("hintNewActivity")}</span>
          </label>
          <button className={primary}>{t("startTimer")}</button>
        </form>
      ) : (
        <p className="text-gray-600">{t("errDiaryNotOpen")}</p>
      )}
      <Link href="/diary" className="text-sm text-primary underline">{t("back")}</Link>
    </div>
  );
}
