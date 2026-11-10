import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getCampaignDetail } from "@/lib/services/campaigns";
import { toISODate } from "@/lib/campaigns/dates";
import { canRemoveParticipant, canRestoreParticipant } from "@/lib/campaigns/participation";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  addParticipantAction,
  changeEndDateAction,
  clearExcludedDateAction,
  launchCampaignAction,
  reopenCampaignAction,
  setExcludedDateAction,
  setReminderAction,
} from "../../campaign-actions";

export const dynamic = "force-dynamic";

const input = "rounded border border-gray-300 px-2 py-1 text-sm";
const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { id } = await params;
  const { error } = await searchParams;
  const d = await getCampaignDetail(user.actor, id);
  const c = d.campaign;
  const status = c.status;

  const observing = status === "INITIAL_MAPPING" || status === "ACTIVE";
  const cancellable = status === "DRAFT" || observing || status === "REVIEW_WINDOW";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <p className="text-gray-600">
          {c.department.name} · {t("period")}: {toISODate(c.startDate)} – {toISODate(c.endDate)} · {t("status")}: {t(`status${status}`)}
        </p>
        <p className="text-sm text-gray-600">
          {t("reviewWindowDays")}: {c.reviewWindowDays} · {t("retrospectiveWindowDays")}: {c.retrospectiveWindowDays} · {t("reminderTime")}: {c.reminderTime}
        </p>
      </div>
      <ErrorBanner code={error} t={t} />

      {d.endDateChanges.length > 0 && (
        <section className="rounded bg-surface p-3 text-sm">
          <h2 className="font-medium">{t("dateChanges")}</h2>
          <ul>
            {d.endDateChanges.map((ch, i) => (
              <li key={i}>
                {ch.at.toISOString().slice(0, 10)}: {ch.oldEndDate} → {ch.newEndDate}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm">
        {t("participantCount")}: {d.participantCount} · {t("acknowledgements")}: {d.acknowledgementCount} / {d.participantCount} · {t("mappingReadiness")}: {d.mappingCompletedCount} / {d.participantCount}
      </p>

      {d.own && (
        <section className="space-y-3 rounded border border-gray-200 p-4">
          <Link href={`/campaigns/${id}/about`} className="text-primary underline">{t("readAbout")}</Link>
          {d.own.acknowledgement && (
            <p className="text-sm">{t("acknowledgedOn")} {d.own.acknowledgement.acknowledgedAt.toISOString().slice(0, 10)}</p>
          )}
          {d.own.participant && (
            <form action={setReminderAction} className="flex items-center gap-3 text-sm">
              <input type="hidden" name="campaignId" value={id} />
              <span className="font-medium">{t("myReminder")}</span>
              <input type="time" name="time" defaultValue={d.own.reminder?.time ?? c.reminderTime} className={input} />
              <label className="flex items-center gap-1">
                <input type="checkbox" name="enabled" defaultChecked={d.own.reminder?.enabled ?? true} />
                {t("reminderEnabled")}
              </label>
              <button className={secondary}>{t("save")}</button>
            </form>
          )}
        </section>
      )}

      {d.canManage && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {status === "DRAFT" && (
              <form action={launchCampaignAction}>
                <input type="hidden" name="campaignId" value={id} />
                <button className={primary}>{t("launch")}</button>
              </form>
            )}
            {status === "REVIEW_WINDOW" && (
              <div className="flex items-center gap-3">
                <Link href={`/campaigns/${id}/confirm?action=lock`} className={primary}>{t("lockCampaign")}</Link>
                <span className="text-sm text-gray-600">{t("lockWarning")}</span>
              </div>
            )}
            {cancellable && (
              <Link href={`/campaigns/${id}/confirm?action=cancel`} className={secondary}>{t("cancelCampaign")}</Link>
            )}
          </div>

          {observing && (
            <form action={changeEndDateAction} className="flex items-end gap-2">
              <input type="hidden" name="campaignId" value={id} />
              <label className="flex flex-col text-sm">
                {t("changeEndDate")}
                <input type="date" name="endDate" required defaultValue={toISODate(c.endDate)} className={input} />
              </label>
              <button className={secondary}>{t("save")}</button>
            </form>
          )}

          {(status === "DRAFT" || observing) && d.addableMembers.length > 0 && (
            <form action={addParticipantAction} className="flex items-end gap-2">
              <input type="hidden" name="campaignId" value={id} />
              <label className="flex flex-col text-sm">
                {t("addParticipant")}
                <select name="userId" className={input}>
                  {d.addableMembers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <button className={secondary}>{t("addParticipant")}</button>
            </form>
          )}

          <div>
            <h2 className="mb-2 font-medium">{t("participants")}</h2>
            <ul className="divide-y divide-gray-200 rounded border border-gray-200">
              {d.participants.map((p) => (
                <li key={p.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span>
                      {p.user.name} <span className="text-sm text-gray-500">· {t(`participant${p.status}`)} · {toISODate(p.joinedAt)}</span>
                    </span>
                    <div className="flex gap-2">
                      {p.status === "ACTIVE" && (status === "DRAFT" || canRemoveParticipant(status, p.status)) && (
                        <>
                          <Link href={`/campaigns/${id}/confirm?action=stop&participantId=${p.id}`} className={secondary}>
                            {status === "DRAFT" ? t("remove") : t("removeStopKeep")}
                          </Link>
                          {status !== "DRAFT" && (
                            <Link href={`/campaigns/${id}/confirm?action=exclude&participantId=${p.id}`} className={secondary}>
                              {t("removeExclude")}
                            </Link>
                          )}
                        </>
                      )}
                      {canRestoreParticipant(status, p.status) && (
                        <Link href={`/campaigns/${id}/confirm?action=restore&participantId=${p.id}`} className={primary}>
                          {t("restoreParticipant")}
                        </Link>
                      )}
                    </div>
                  </div>
                  {status !== "DRAFT" && p.periods.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{t("participationHistory")}:</span>
                      <ul className="list-disc pl-5">
                        {p.periods.map((period) => (
                          <li key={period.id}>
                            {t(`period${period.startedKind}`)} {toISODate(period.startDate)}
                            {period.inactiveFrom && period.endMode
                              ? ` → ${t(`end${period.endMode}`)} ${toISODate(period.inactiveFrom)}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                      {p.periods.length > 1 || p.status !== "ACTIVE" ? <p className="text-xs">{t("historyNote")}</p> : null}
                    </div>
                  )}
                  {status !== "DRAFT" && p.status === "ACTIVE" && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-600">{t("absentDays")}:</span>
                      {p.excludedDates.map((ed) => (
                        <form key={ed.id} action={clearExcludedDateAction} className="flex items-center gap-1">
                          <input type="hidden" name="campaignId" value={id} />
                          <input type="hidden" name="excludedDateId" value={ed.id} />
                          <span>{toISODate(ed.date)}</span>
                          <button aria-label={t("remove")} className="text-primary">×</button>
                        </form>
                      ))}
                      <form action={setExcludedDateAction} className="flex items-center gap-1">
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="participantId" value={p.id} />
                        <input type="date" name="date" required min={toISODate(c.startDate)} max={toISODate(c.endDate)} className={input} />
                        <button className={secondary}>{t("addAbsentDay")}</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {d.canManage && d.mappingReadiness.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">{t("mappingReadinessTitle")}</h2>
          <p className="text-xs text-gray-500">{t("readinessNote")}</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="py-1 pr-3">{t("participants")}</th>
                <th scope="col" className="py-1 pr-3">{t("colStatus")}</th>
                <th scope="col" className="py-1">{t("completedOn")}</th>
              </tr>
            </thead>
            <tbody>
              {d.mappingReadiness.map((r) => (
                <tr key={r.participantId} className="border-b border-gray-100">
                  <th scope="row" className="py-1 pr-3 font-normal">{r.name}</th>
                  <td className="py-1 pr-3">{t(`mapStatus${r.status}`)}</td>
                  <td className="py-1">{r.completedAt ? toISODate(r.completedAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.canReopen && (status === "LOCKED" || status === "FINAL") && (
        <form action={reopenCampaignAction} className="flex items-end gap-2">
          <input type="hidden" name="campaignId" value={id} />
          <label className="flex flex-1 flex-col text-sm">
            {t("reason")}
            <input name="reason" required minLength={5} className={input} />
          </label>
          <button className={secondary}>{t("reopenCampaign")}</button>
        </form>
      )}
    </div>
  );
}
