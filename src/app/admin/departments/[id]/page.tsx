import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { can } from "@/lib/auth/policy";
import { getDepartmentDetail } from "@/lib/services/departments";
import { listAssignableUsers } from "@/lib/services/users";
import { groupCandidates } from "@/lib/membership/candidates";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExistingUserPicker, type PickerGroup } from "@/components/ExistingUserPicker";
import { createUserAction } from "../../../user-actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";

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
  const { t, locale } = await getT();
  const { id } = await params;
  const { error } = await searchParams;

  const { department, members, manager } = await getDepartmentDetail(actor, id);
  const assignable = await listAssignableUsers(actor);
  const candidates = assignable.map((u) => {
    const m = u.memberships[0];
    return {
      id: u.id,
      name: u.name,
      active: u.active,
      isOrgAdmin: u.isOrgAdmin,
      membership: m ? { departmentId: m.departmentId, departmentName: m.department.name, role: m.role } : null,
    };
  });

  const toPickerGroups = (groups: ReturnType<typeof groupCandidates>): PickerGroup[] =>
    groups.map((g) => ({
      key: g.key,
      label:
        g.departmentId === null
          ? t("groupAvailable")
          : g.departmentId === id
            ? `${g.departmentName} (${t("thisDepartment")})`
            : (g.departmentName ?? ""),
      users: g.users.map((u) => ({
        id: u.id,
        name: u.name,
        departmentName: u.departmentName,
        roleLabel: u.role ? t(`role${u.role}`) : null,
      })),
    }));

  const transferGroups = toPickerGroups(groupCandidates(candidates, { targetDepartmentId: id, includeTargetDepartment: false }));
  const managerGroups = toPickerGroups(
    groupCandidates(candidates, { targetDepartmentId: id, includeTargetDepartment: true, excludeUserIds: manager ? [manager.userId] : [] }),
  );
  const returnTo = `/admin/departments/${id}`;

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

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="font-medium">{t("createNewUserSection")}</h2>
        <p className="text-sm text-gray-600">{t("createNewUserHelp")}</p>
        <form action={createUserAction} className="grid grid-cols-2 gap-3 text-sm">
          <input type="hidden" name="departmentId" value={id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="flex flex-col">{t("firstName")}<input name="firstName" required maxLength={60} className={input} /></label>
          <label className="flex flex-col">{t("lastName")}<input name="lastName" required maxLength={60} className={input} /></label>
          <label className="col-span-2 flex flex-col">{t("email")}<input type="email" name="email" required maxLength={120} className={input} /></label>
          <p className="flex flex-col">
            <span>{t("department")}</span>
            <span className="rounded bg-surface px-2 py-1">{department.name}</span>
          </p>
          <label className="flex flex-col">{t("role")}
            <select name="role" defaultValue="EMPLOYEE" className={input}>
              <option value="EMPLOYEE">{t("roleEMPLOYEE")}</option>
              <option value="MANAGER">{t("roleMANAGER")}</option>
            </select>
          </label>
          <div><button className="rounded bg-primary px-3 py-1 text-white hover:bg-primary-dark">{t("createUser")}</button></div>
        </form>
      </section>

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="font-medium">{t("addTransferSection")}</h2>
        <p className="text-sm text-gray-600">{t("addTransferHelp")}</p>
        <ExistingUserPicker groups={transferGroups} departmentId={id} returnTo={returnTo} labels={messages[locale]} />
      </section>

      <section id="manager" className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="font-medium">{t("assignChangeManager")}</h2>
        <p className="text-sm text-gray-600">{t("managerHelp")}</p>
        <ExistingUserPicker groups={managerGroups} departmentId={id} returnTo={returnTo} fixedRole="MANAGER" labels={messages[locale]} />
      </section>
    </div>
  );
}
