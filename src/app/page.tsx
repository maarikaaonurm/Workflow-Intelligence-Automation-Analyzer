import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getOwnMapping } from "@/lib/services/mapping";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  // Participant home: status of my own Initial Activity Mapping (any department role that participates).
  const mapping = user.actor.departmentRole !== null ? await getOwnMapping(user.actor) : null;

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
      {mapping && (
        <section className="mt-6 space-y-2 rounded border border-gray-200 p-4">
          <h2 className="font-medium">{t("mappingStatusHeading")}</h2>
          <p className="text-sm text-gray-600">
            {mapping.campaign.name} · {t(`mapStatus${mapping.status}`)}
          </p>
          <Link href="/mapping" className="inline-block rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark">
            {t(mapping.status === "NOT_STARTED" ? "startMapping" : mapping.status === "DRAFT" ? "continueMapping" : "viewMapping")}
          </Link>
        </section>
      )}
      <p className="mt-6 rounded bg-surface p-4">{t("nextSteps")}</p>
    </div>
  );
}
