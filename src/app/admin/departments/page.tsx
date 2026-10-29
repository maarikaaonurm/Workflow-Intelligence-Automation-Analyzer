import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { listDepartments } from "@/lib/services/departments";
import { assignManagerAction, createDepartmentAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { actor } = user;

  const departments = await listDepartments(actor);
  const isAdmin = can(actor, "department:create", { organizationId: actor.organizationId });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("departments")}</h1>

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
          <section key={d.id} className="rounded border border-gray-200 p-4">
            <h2 className="text-lg font-medium">{d.name}</h2>
            <p className="text-sm text-gray-600">
              {t("manager")}: {manager ? manager.user.name : t("noManager")}
            </p>
            <p className="mt-2 text-sm">
              {t("members")}: {d.memberships.map((m) => m.user.name).join(", ") || "-"}
            </p>
            {isAdmin && d.memberships.length > 0 && (
              <form action={assignManagerAction} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="departmentId" value={d.id} />
                <select name="userId" defaultValue={manager?.userId} className="rounded border border-gray-300 px-2 py-1 text-sm">
                  {d.memberships.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
                <button className="rounded border border-primary px-3 py-1 text-sm text-primary">{t("assignManager")}</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
