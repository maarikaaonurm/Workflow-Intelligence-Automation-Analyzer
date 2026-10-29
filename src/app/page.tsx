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
      <p className="mt-2 text-gray-600">
        {t("role")}: {t(`role${user.actor.role}`)}
        {user.departmentName ? ` · ${t("department")}: ${user.departmentName}` : ""}
      </p>
      <p className="mt-6 rounded bg-surface p-4">{t("nextSteps")}</p>
    </div>
  );
}
