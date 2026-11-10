import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { listUsers, type UserStatusFilter } from "@/lib/services/users";
import { listDepartments } from "@/lib/services/departments";
import { ErrorBanner } from "@/components/ErrorBanner";
import { createUserAction } from "../../user-actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { actor } = user;
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) redirect("/");
  const { t } = await getT();
  const { error, status } = await searchParams;
  const filter: UserStatusFilter = status === "inactive" || status === "all" ? status : "active";

  const [users, departments] = await Promise.all([listUsers(actor, filter), listDepartments(actor)]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("users")}</h1>
      <ErrorBanner code={error} t={t} />

      <form action={createUserAction} className="grid grid-cols-2 gap-3 rounded border border-gray-200 p-4 text-sm">
        <h2 className="col-span-2 font-medium">{t("createUser")}</h2>
        <label className="flex flex-col">{t("firstName")}<input name="firstName" required maxLength={60} className={input} /></label>
        <label className="flex flex-col">{t("lastName")}<input name="lastName" required maxLength={60} className={input} /></label>
        <label className="col-span-2 flex flex-col">{t("email")}<input type="email" name="email" required maxLength={120} className={input} /></label>
        <label className="flex flex-col">{t("department")}
          <select name="departmentId" required defaultValue="" className={input}>
            <option value="" disabled>{t("select")}</option>
            {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </label>
        <label className="flex flex-col">{t("role")}
          <select name="role" defaultValue="EMPLOYEE" className={input}>
            <option value="EMPLOYEE">{t("roleEMPLOYEE")}</option>
            <option value="MANAGER">{t("roleMANAGER")}</option>
          </select>
        </label>
        <p className="col-span-2 text-xs text-gray-500">{t("createUserHelp")}</p>
        <div><button className="rounded bg-primary px-3 py-1 text-white hover:bg-primary-dark">{t("create")}</button></div>
      </form>

      <nav className="flex gap-4 text-sm">
        {(["active", "inactive", "all"] as const).map((f) => (
          <Link key={f} href={`/admin/users?status=${f}`} className={f === filter ? "font-bold text-primary" : "text-primary underline"}>
            {t(`filter_${f}`)}
          </Link>
        ))}
      </nav>

      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {users.map((u) => {
          const m = u.memberships[0];
          return (
            <li key={u.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className={u.active ? "" : "text-gray-400"}>
                {u.name} <span className="text-gray-500">· {u.email}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {[u.isOrgAdmin ? t("roleADMIN") : null, m ? `${m.department.name} · ${t(`role${m.role}`)}` : t("noDepartment")].filter(Boolean).join(" + ")}
                  {!u.active && ` · ${t("userInactive")}`}
                </span>
              </span>
              <Link href={`/admin/users/${u.id}`} className="text-primary underline">{t("editUser")}</Link>
            </li>
          );
        })}
        {users.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">{t("noUsers")}</li>}
      </ul>
    </div>
  );
}
