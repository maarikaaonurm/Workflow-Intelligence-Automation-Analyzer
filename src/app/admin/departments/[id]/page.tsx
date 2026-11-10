import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { getDepartmentDetail } from "@/lib/services/departments";
import { listAssignableUsers } from "@/lib/services/users";
import { ErrorBanner } from "@/components/ErrorBanner";
import { addDepartmentMemberAction, assignDepartmentManagerAction } from "../../../user-actions";

export const dynamic = "force-dynamic";

const input = "rounded border border-gray-300 px-2 py-1 text-sm";
const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";

export default async function DepartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { actor } = user;
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) redirect("/admin/departments");
  const { t } = await getT();
  const { id } = await params;
  const { error } = await searchParams;

  const { department, members, manager } = await getDepartmentDetail(actor, id);
  const assignable = await listAssignableUsers(actor);
  const label = (u: (typeof assignable)[number]) => {
    const m = u.memberships[0];
    return `${u.name} (${m ? m.department.name : t("noDepartment")})`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{department.name}</h1>
        <p className="text-sm text-gray-600">
          {t("manager")}: {manager ? manager.user.name : t("noManager")} · {t("activeMembers")}: {members.length}
        </p>
      </div>
      <ErrorBanner code={error} t={t} />

      <section>
        <h2 className="mb-2 font-medium">{t("members")}</h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-600">{t("noMembers")}</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {m.user.name} <span className="text-gray-500">· {t(`role${m.role}`)}</span>
                </span>
                <Link href={`/admin/users/${m.userId}`} className="text-primary underline">{t("editUser")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="manager" className="space-y-2 rounded border border-gray-200 p-4">
        <h2 className="font-medium">{t("assignChangeManager")}</h2>
        <p className="text-sm text-gray-600">{t("managerHelp")}</p>
        <form action={assignDepartmentManagerAction} className="space-y-2">
          <input type="hidden" name="departmentId" value={id} />
          <select name="userId" required defaultValue={manager?.userId ?? ""} className={input}>
            <option value="" disabled>{t("select")}</option>
            {assignable.map((u) => (
              <option key={u.id} value={u.id}>{label(u)}</option>
            ))}
          </select>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="ackCampaigns" className="mt-1" />
            {t("ackCampaigns")}
          </label>
          <button className={primary}>{t("assignManager")}</button>
        </form>
      </section>

      <section className="space-y-2 rounded border border-gray-200 p-4">
        <h2 className="font-medium">{t("addMember")}</h2>
        <p className="text-sm text-gray-600">
          {t("addMemberHelp")} <Link href="/admin/users" className="text-primary underline">{t("createUser")}</Link>
        </p>
        <form action={addDepartmentMemberAction} className="space-y-2">
          <input type="hidden" name="departmentId" value={id} />
          <div className="flex flex-wrap gap-2">
            <select name="userId" required defaultValue="" className={input}>
              <option value="" disabled>{t("select")}</option>
              {assignable
                .filter((u) => u.memberships[0]?.departmentId !== id)
                .map((u) => (
                  <option key={u.id} value={u.id}>{label(u)}</option>
                ))}
            </select>
            <select name="role" defaultValue="EMPLOYEE" className={input}>
              <option value="EMPLOYEE">{t("roleEMPLOYEE")}</option>
              <option value="MANAGER">{t("roleMANAGER")}</option>
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="ackCampaigns" className="mt-1" />
            {t("ackCampaigns")}
          </label>
          <button className={primary}>{t("addMember")}</button>
        </form>
      </section>
    </div>
  );
}
