import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getCampaignDetail } from "@/lib/services/campaigns";
import { toISODate } from "@/lib/campaigns/dates";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  addParticipantAction,
  cancelCampaignAction,
  changeEndDateAction,
  clearExcludedDateAction,
  launchCampaignAction,
  lockCampaignAction,
  removeParticipantAction,
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
        {t("participantCount")}: {d.participantCount} · {t("acknowledgements")}: {d.acknowledgementCount} / {d.participantCount}
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
              <form action={lockCampaignAction} className="flex items-center gap-3">
                <input type="hidden" name="campaignId" value={id} />
                <button className={primary}>{t("lockCampaign")}</button>
                <span className="text-sm text-gray-600">{t("lockWarning")}</span>
              </form>
            )}
            {cancellable && (
              <form action={cancelCampaignAction}>
                <input type="hidden" name="campaignId" value={id} />
                <button className={secondary}>{t("cancelCampaign")}</button>
              </form>
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

          {(status === "DRAFT" || observing) && d.addableEmployees.length > 0 && (
            <form action={addParticipantAction} className="flex items-end gap-2">
              <input type="hidden" name="campaignId" value={id} />
              <label className="flex flex-col text-sm">
                {t("addParticipant")}
                <select name="userId" className={input}>
                  {d.addableEmployees.map((u) => (
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
                    {p.status === "ACTIVE" && status !== "LOCKED" && (
                      <form action={removeParticipantAction} className="flex gap-2">
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="participantId" value={p.id} />
                        {status === "DRAFT" ? (
                          <button name="mode" value="STOP_KEEP_DATA" className={secondary}>{t("remove")}</button>
                        ) : (
                          <>
                            <button name="mode" value="STOP_KEEP_DATA" className={secondary}>{t("removeStopKeep")}</button>
                            <button name="mode" value="EXCLUDE_DATA" className={secondary}>{t("removeExclude")}</button>
                          </>
                        )}
                      </form>
                    )}
                  </div>
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
