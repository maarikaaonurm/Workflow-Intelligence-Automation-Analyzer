import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {t("welcome")}, {user.name}
      </h1>
      <ul className="mt-2 text-gray-600">
        {user.actor.isOrgAdmin && <li>{t("organizationPrivilege")}: {t("roleADMIN")}</li>}
        {user.actor.departmentRole ? (
          <li>
            {t("department")}: {user.departmentName} · {t("role")}: {t(`role${user.actor.departmentRole}`)}
          </li>
        ) : (
          <li>{t("noDepartment")}</li>
        )}
      </ul>
      <p className="mt-6 rounded bg-surface p-4">{t("nextSteps")}</p>
    </div>
  );
}
