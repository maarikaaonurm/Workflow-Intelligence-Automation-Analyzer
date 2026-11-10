import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { listDepartments } from "@/lib/services/departments";
import { ErrorBanner } from "@/components/ErrorBanner";
import { createDepartmentAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { error } = await searchParams;
  const { actor } = user;

  const departments = await listDepartments(actor);
  const isAdmin = can(actor, "department:create", { organizationId: actor.organizationId });
  const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("departments")}</h1>
      <ErrorBanner code={error} t={t} />

      {isAdmin && (
        <form action={createDepartmentAction} className="flex items-end gap-2">
          <label className="flex flex-col text-sm">
            {t("departmentName")}
            <input name="name" required maxLength={100} className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <button className="rounded bg-primary px-3 py-1 text-white hover:bg-primary-dark">{t("createDepartment")}</button>
        </form>
      )}

      {departments.map((d) => {
        const manager = d.memberships.find((m) => m.role === "MANAGER");
        return (
          <section key={d.id} className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4">
            <div>
              <h2 className="text-lg font-medium">{d.name}</h2>
              <p className="text-sm text-gray-600">
                {t("manager")}: {manager ? manager.user.name : t("noManager")} · {t("activeMembers")}: {d.memberships.length}
              </p>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Link href={`/admin/departments/${d.id}`} className={secondary}>{t("manageMembers")}</Link>
                <Link href={`/admin/departments/${d.id}#manager`} className={secondary}>{t("assignChangeManager")}</Link>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
