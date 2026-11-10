import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { getUserDetail } from "@/lib/services/users";
import { listDepartments } from "@/lib/services/departments";
import { toISODate } from "@/lib/campaigns/dates";
import { ErrorBanner } from "@/components/ErrorBanner";
import { reactivateUserAction, updateUserAction } from "../../../user-actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { actor } = me;
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) redirect("/");
  const { t } = await getT();
  const { id } = await params;
  const { error } = await searchParams;

  const [{ user, current, history, impactedCampaigns }, departments] = await Promise.all([
    getUserDetail(actor, id),
    listDepartments(actor),
  ]);
  const deptSelect = (defaultValue?: string) => (
    <select name="departmentId" required defaultValue={defaultValue ?? ""} className={input}>
      <option value="" disabled>{t("select")}</option>
      {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
    </select>
  );
  const roleSelect = (defaultValue = "EMPLOYEE") => (
    <select name="role" defaultValue={defaultValue} className={input}>
      <option value="EMPLOYEE">{t("roleEMPLOYEE")}</option>
      <option value="MANAGER">{t("roleMANAGER")}</option>
    </select>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <p className="text-sm text-gray-600">
          {user.email} · {user.active ? t("userActive") : t("userInactive")}
          {user.isOrgAdmin ? ` · ${t("roleADMIN")}` : ""}
        </p>
      </div>
      <ErrorBanner code={error} t={t} />

      <form action={updateUserAction} className="grid grid-cols-2 gap-3 rounded border border-gray-200 p-4 text-sm">
        <input type="hidden" name="userId" value={user.id} />
        <h2 className="col-span-2 font-medium">{t("editUser")}</h2>
        <label className="flex flex-col">{t("firstName")}<input name="firstName" required defaultValue={user.firstName} maxLength={60} className={input} /></label>
        <label className="flex flex-col">{t("lastName")}<input name="lastName" required defaultValue={user.lastName} maxLength={60} className={input} /></label>
        <label className="col-span-2 flex flex-col">{t("email")}<input type="email" name="email" required defaultValue={user.email} maxLength={120} className={input} /></label>
        <div><button className={primary}>{t("save")}</button></div>
      </form>

      {!user.isOrgAdmin && user.active && (
        <section className="space-y-3 rounded border border-gray-200 p-4">
          <h2 className="font-medium">{t("departmentAndRole")}</h2>
          {impactedCampaigns.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">{t("campaignImpactTitle")}</p>
              <ul className="list-disc pl-5">
                {impactedCampaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="underline">{c.name}</Link> · {t(`status${c.status}`)}
                  </li>
                ))}
              </ul>
              <p className="mt-1">{t("campaignImpactNote")}</p>
            </div>
          )}
          {/* Changing department or role is reviewed on a confirmation page first; nothing changes on submit here. */}
          <form method="get" action="/admin/membership/confirm" className="space-y-2">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="returnTo" value={`/admin/users/${user.id}`} />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col text-sm">{t("department")}{deptSelect(current?.departmentId)}</label>
              <label className="flex flex-col text-sm">{t("role")}{roleSelect(current?.role)}</label>
            </div>
            <p className="text-xs text-gray-500">{t("roleManagerReplaceNote")}</p>
            <button className={primary}>{t("reviewChange")}</button>
          </form>
          <Link href={`/admin/users/${user.id}/confirm`} className={secondary}>{t("deactivateUser")}</Link>
        </section>
      )}

      {!user.isOrgAdmin && !user.active && (
        <form action={reactivateUserAction} className="space-y-2 rounded border border-gray-200 p-4">
          <input type="hidden" name="userId" value={user.id} />
          <h2 className="font-medium">{t("reactivateUser")}</h2>
          <p className="text-sm text-gray-600">{t("reactivateHelp")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm">{t("department")}{deptSelect(history[0]?.departmentId)}</label>
            <label className="flex flex-col text-sm">{t("role")}{roleSelect("EMPLOYEE")}</label>
          </div>
          <button className={primary}>{t("reactivateUser")}</button>
        </form>
      )}

      {!user.isOrgAdmin && (
        <section>
          <h2 className="mb-2 font-medium">{t("membershipHistory")}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-gray-600">{t("noDepartment")}</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded border border-gray-200 text-sm">
              {history.map((m) => (
                <li key={m.id} className="px-4 py-2">
                  {m.department.name} · {t(`role${m.role}`)} · {toISODate(m.startedAt)} – {m.endedAt ? toISODate(m.endedAt) : t("present")}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
