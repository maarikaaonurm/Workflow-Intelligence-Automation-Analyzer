import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOwnMapping } from "@/lib/services/mapping";
import { localized } from "@/lib/mapping/present";
import { ErrorBanner } from "@/components/ErrorBanner";

export const dynamic = "force-dynamic";

export default async function MappingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Any department member who participates (Employee, Department Manager, or an Organization Admin with a department).
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { error } = await searchParams;
  const mapping = await getOwnMapping(user.actor);

  if (!mapping) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{t("myMapping")}</h1>
        <p className="text-gray-600">{t("noOwnCampaign")}</p>
      </div>
    );
  }

  const { campaign, activities, completed, canEdit, acknowledged, status } = mapping;
  const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
  const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("myMapping")}</h1>
        <p className="text-gray-600">
          {campaign.name} · {t(`mapStatus${status}`)}
        </p>
      </div>
      <ErrorBanner code={error} t={t} />

      {!acknowledged && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          {t("errAcknowledgeFirst")}{" "}
          <Link href={`/campaigns/${campaign.id}/about`} className="text-primary underline">{t("readAbout")}</Link>
        </p>
      )}
      {completed && <p className="rounded bg-surface p-3 text-sm">{t("baselineNote")}</p>}

      {canEdit && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-2 rounded border border-gray-200 p-4">
            <h2 className="font-medium">{t("optionATitle")}</h2>
            <p className="text-sm text-gray-600">{t("optionADesc")}</p>
            <Link href="/mapping/new" className={`${primary} inline-block`}>{t("addActivity")}</Link>
          </section>
          <section className="space-y-2 rounded border border-gray-200 p-4">
            <h2 className="font-medium">{t("optionBTitle")}</h2>
            <p className="text-sm text-gray-600">{t("optionBDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {/* Plain links: file downloads from a route handler, in the current interface language. */}
              <a href="/mapping/template?format=xlsx" download className={secondary}>{t("downloadTemplate")} (.xlsx)</a>
              <a href="/mapping/template?format=csv" download className={secondary}>(.csv)</a>
              <Link href="/mapping/import" className={primary}>{t("importCompletedTemplate")}</Link>
            </div>
          </section>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/categories" className={secondary}>{t("categoryGuide")}</Link>
        {canEdit && !completed && activities.length > 0 && (
          <Link href="/mapping/confirm?action=complete" className={primary}>{t("completeMapping")}</Link>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-600">{t("noActivities")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("myMapping")}</caption>
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="py-2 pr-3">{t("colActivity")}</th>
                <th scope="col" className="py-2 pr-3">{t("colCategory")}</th>
                <th scope="col" className="py-2 pr-3">{t("colFrequency")}</th>
                <th scope="col" className="py-2 pr-3">{t("colDuration")}</th>
                <th scope="col" className="py-2 pr-3">{t("colSystems")}</th>
                <th scope="col" className="py-2 pr-3">{t("colStatus")}</th>
                <th scope="col" className="py-2"><span className="sr-only">{t("edit")}</span></th>
              </tr>
            </thead>
            <tbody>
              {activities.map(({ id, source, version }) => (
                <tr key={id} className="border-b border-gray-100 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">{version.name}</th>
                  <td className="py-2 pr-3">{localized(version.primaryCategory, locale)}</td>
                  <td className="py-2 pr-3">{version.occurrenceCount} × {t(`freq${version.frequency}`)}</td>
                  <td className="py-2 pr-3">{version.avgDurationMinutes} {t("minutesShort")}</td>
                  <td className="py-2 pr-3">{version.systems.map((s) => s.name).join(", ")}</td>
                  <td className="py-2 pr-3">
                    <span className="mr-1 rounded bg-surface px-2 py-0.5 text-xs text-gray-700">
                      {version.isBaseline ? t("baseline") : t("mapStatusDRAFT")}
                    </span>
                    {version.versionNumber > 1 && (
                      <span className="mr-1 rounded bg-surface px-2 py-0.5 text-xs text-gray-700">{t("versionRefined")} v{version.versionNumber}</span>
                    )}
                    <span className="rounded bg-surface px-2 py-0.5 text-xs text-gray-700">{t(`source${source}`)}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {canEdit && <Link href={`/mapping/${id}`} className="mr-3 text-primary underline">{t("edit")}</Link>}
                    {canEdit && !completed && (
                      <Link href={`/mapping/confirm?action=delete&activityId=${id}`} className="text-primary underline">{t("delete")}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
