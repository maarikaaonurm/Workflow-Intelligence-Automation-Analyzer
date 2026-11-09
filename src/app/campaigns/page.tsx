import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { listCampaigns } from "@/lib/services/campaigns";
import { listDepartments } from "@/lib/services/departments";
import { toISODate } from "@/lib/campaigns/dates";
import { ErrorBanner } from "@/components/ErrorBanner";
import { createCampaignAction } from "../campaign-actions";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { error } = await searchParams;
  const { actor } = user;

  const [campaigns, departments] = await Promise.all([listCampaigns(actor), listDepartments(actor)]);
  const canCreate = actor.role === "ADMIN" || can(actor, "campaign:create", { organizationId: actor.organizationId, departmentId: actor.departmentId });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("campaigns")}</h1>
      <ErrorBanner code={error} t={t} />

      {canCreate && (
        <form action={createCampaignAction} className="grid grid-cols-2 gap-3 rounded border border-gray-200 p-4 text-sm">
          <h2 className="col-span-2 font-medium">{t("newCampaign")}</h2>
          {actor.role === "ADMIN" ? (
            <label className="col-span-2 flex flex-col">
              {t("department")}
              <select name="departmentId" className="rounded border border-gray-300 px-2 py-1">
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="departmentId" value={actor.departmentId ?? ""} />
          )}
          <label className="col-span-2 flex flex-col">
            {t("campaignName")}
            <input name="name" required maxLength={120} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            {t("startDate")}
            <input type="date" name="startDate" required defaultValue={toISODate(new Date())} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            {t("endDate")}
            <input type="date" name="endDate" required className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            {t("reviewWindowDays")}
            <input type="number" name="reviewWindowDays" min={0} max={5} defaultValue={2} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            {t("retrospectiveWindowDays")}
            <input type="number" name="retrospectiveWindowDays" min={0} max={14} defaultValue={3} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col">
            {t("reminderTime")}
            <input type="time" name="reminderTime" required defaultValue="16:00" className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <div className="flex items-end">
            <button className="rounded bg-primary px-3 py-1 text-white hover:bg-primary-dark">{t("create")}</button>
          </div>
        </form>
      )}

      {campaigns.length === 0 ? (
        <p className="text-gray-600">{t("noCampaigns")}</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-600">
                  {c.department.name} · {toISODate(c.startDate)} – {toISODate(c.endDate)} · {t(`status${c.status}`)}
                </p>
              </div>
              <Link href={`/campaigns/${c.id}`} className="text-primary underline">{t("view")}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
