import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { localized } from "@/lib/mapping/present";
import { getOwnDiary } from "@/lib/services/diary";
import { toISODate } from "@/lib/campaigns/dates";
import { minuteToTime } from "@/lib/diary/form";
import { ErrorBanner } from "@/components/ErrorBanner";
import { logSharedMeetingAction, toggleFavoriteAction } from "../diary-actions";

export const dynamic = "force-dynamic";

const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";
const hm = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ error?: string; range?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { error, range } = await searchParams;
  const diary = await getOwnDiary(user.actor, { days: range === "all" ? "all" : 14 });

  if (!diary) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{t("myDiary")}</h1>
        <p className="text-gray-600">{t("noOwnCampaign")}</p>
      </div>
    );
  }

  const { perms, status, coverage, days, favorites, timer, meetings, confirmed } = diary;
  const writable = perms.create && diary.participant.status === "ACTIVE" && diary.acknowledged;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("myDiary")}</h1>
        <p className="text-gray-600">
          {diary.campaign.name} · {t(`status${status}`)} · {toISODate(diary.campaign.startDate)} – {toISODate(diary.campaign.endDate)}
          {status === "ACTIVE" ? ` · ${t("daysRemaining")}: ${diary.daysRemaining}` : ""}
        </p>
      </div>
      <ErrorBanner code={error} t={t} />

      {!diary.acknowledged && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t("errAcknowledgeFirst")} <Link href={`/campaigns/${diary.campaign.id}/about`} className="text-primary underline">{t("readAbout")}</Link>
        </p>
      )}
      {diary.reminder.due && <p role="status" className="rounded border border-primary/30 bg-surface p-3 text-sm">{t("reminderText")}</p>}
      {status === "INITIAL_MAPPING" && <p className="rounded bg-surface p-3 text-sm">{t("diaryNotOpenYet")}</p>}
      {perms.confirm && (
        <p className="rounded bg-surface p-3 text-sm">{t("reviewWindowNote")}</p>
      )}

      <div className="flex flex-wrap gap-3">
        {writable && <Link href="/diary/new" className={primary}>{t("logActivity")}</Link>}
        {writable && <Link href={timer ? "/diary/timer" : "/diary/timer"} className={secondary}>{timer ? t("openTimer") : t("startTimer")}</Link>}
        {writable && <Link href="/diary/quick" className={secondary}>{t("quickAdd")}</Link>}
        {writable && <Link href="/diary/meeting" className={secondary}>{t("logMeeting")}</Link>}
        {perms.confirm && !confirmed && <Link href="/diary/confirm?action=confirmDiary" className={primary}>{t("confirmMyDiary")}</Link>}
        {confirmed && <span className="rounded bg-surface px-3 py-1 text-sm">{t("diaryConfirmed")} · {diary.confirmedAt ? toISODate(diary.confirmedAt) : ""}</span>}
      </div>

      {timer && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t("timerRunning")}: {timer.title} ·{" "}
          <Link href="/diary/timer" className="text-primary underline">{t("openTimer")}</Link>
        </p>
      )}

      <section className="rounded border border-gray-200 p-4 text-sm">
        <p>
          {t("coverageLine")
            .replace("{done}", String(coverage.daysWithEntries))
            .replace("{eligible}", String(coverage.eligibleDays))}
        </p>
        <p className="text-xs text-gray-500">{t("coverageNote")}</p>
      </section>

      {favorites.length > 0 && writable && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("favorites")}</h2>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <Link key={f.id} href={`/diary/new?activity=${f.id}&source=FAVORITE`} className={secondary}>
                {t("logFavorite")} {f.version.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("myActivities")}</h2>
        {diary.activities.length === 0 ? (
          <p className="text-sm text-gray-600">{t("noActivities")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {diary.activities.map((a) => (
              <li key={a.id}>
                <form action={toggleFavoriteAction} className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1">
                  <input type="hidden" name="campaignId" value={diary.campaign.id} />
                  <input type="hidden" name="activityId" value={a.id} />
                  <span>{a.version.name}</span>
                  <button className="text-primary underline" aria-label={a.favorite ? t("removeFavorite") : t("addFavorite")}>
                    {a.favorite ? "★" : "☆"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {meetings.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("sharedMeetings")}</h2>
          <ul className="divide-y divide-gray-200 rounded border border-gray-200 text-sm">
            {meetings.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2">
                <span>{m.title} · {toISODate(m.meetingDate)} · {m.durationMinutes} {t("minutesShort")}</span>
                {m.logged ? (
                  <span className="text-gray-500">{t("meetingLogged")}</span>
                ) : (
                  writable && (
                    <form action={logSharedMeetingAction}>
                      <input type="hidden" name="meetingId" value={m.id} />
                      <button className={secondary}>{t("addToMyDiary")}</button>
                    </form>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("diaryEntries")}</h2>
          <Link href={range === "all" ? "/diary" : "/diary?range=all"} className="text-sm text-primary underline">
            {range === "all" ? t("showRecent") : t("showAll")}
          </Link>
        </div>
        {days.length === 0 && <p className="text-sm text-gray-600">{t("noEntries")}</p>}
        {days.map((day) => (
          <div key={day.date} className="rounded border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-surface px-3 py-2 text-sm">
              <span className="font-medium">{day.date}{day.date === diary.today ? ` · ${t("today")}` : ""}</span>
              <span className="text-gray-600">
                {t("recorded")}: {hm(day.totals.recorded)}
                {day.totals.hasOverlap && ` · ${t("uniqueTime")}: ${hm(day.totals.unique)}`}
                {day.totals.outOfScope > 0 && ` · ${t("outOfScopeTime")}: ${hm(day.totals.outOfScope)}`}
              </span>
            </div>
            <ul className="divide-y divide-gray-100">
              {day.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {e.kind === "MEETING" && <span className="mr-2 rounded bg-surface px-2 py-0.5 text-xs">{t("meeting")}</span>}
                      {e.title}
                    </p>
                    <p className="text-gray-600">
                      {e.durationMinutes} {t("minutesShort")}
                      {e.startMinute !== null && e.endMinute !== null ? ` · ${minuteToTime(e.startMinute)}–${minuteToTime(e.endMinute)}` : ""}
                      {e.condition !== "NORMAL" ? ` · ${t(`cond${e.condition}`)}` : ""}
                      {e.interrupted ? ` · ${t("dfield_interrupted")}` : ""}
                      {e.outOfScope ? ` · ${t("dfield_outOfScope")}` : ""}
                      {e.volume !== null ? ` · ${e.volume} ${e.volumeUnit ? localized(e.volumeUnit, locale) : ""}` : ""}
                    </p>
                    {e.note && <p className="text-gray-500">{e.note}</p>}
                  </div>
                  <div className="flex gap-3 whitespace-nowrap">
                    {perms.edit && <Link href={`/diary/${e.id}`} className="text-primary underline">{t("edit")}</Link>}
                    {writable && e.kind === "ACTIVITY" && <Link href={`/diary/new?from=${e.id}&source=LOG_AGAIN`} className="text-primary underline">{t("logAgain")}</Link>}
                    {perms.delete && <Link href={`/diary/confirm?action=delete&entryId=${e.id}`} className="text-primary underline">{t("delete")}</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
