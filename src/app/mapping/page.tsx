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

  const { campaign, activities, completed, canEdit, acknowledged } = mapping;
  const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
  const secondary = "rounded border border-primary px-3 py-1 text-sm text-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("myMapping")}</h1>
        <p className="text-gray-600">
          {campaign.name} · {completed ? t("mappingCompleted") : t("mappingDraft")}
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

      <div className="flex flex-wrap gap-3">
        {canEdit && <Link href="/mapping/new" className={primary}>{t("addActivity")}</Link>}
        {canEdit && <Link href="/mapping/import" className={secondary}>{t("importActivities")}</Link>}
        <Link href="/categories" className={secondary}>{t("categoryGuide")}</Link>
        {canEdit && !completed && activities.length > 0 && (
          <Link href="/mapping/confirm?action=complete" className={primary}>{t("completeMapping")}</Link>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-600">{t("noActivities")}</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {activities.map(({ id, version }) => (
            <li key={id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">
                  {version.name}
                  {version.versionNumber > 1 && <span className="ml-2 text-xs text-gray-500">v{version.versionNumber}</span>}
                  {version.isBaseline && <span className="ml-2 rounded bg-surface px-2 py-0.5 text-xs text-gray-600">{t("baseline")}</span>}
                </p>
                <p className="text-sm text-gray-600">
                  {localized(version.primaryCategory, locale)} · {version.occurrenceCount} × {t(`freq${version.frequency}`)} · {version.avgDurationMinutes} min
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                {canEdit && <Link href={`/mapping/${id}`} className="text-primary underline">{t("edit")}</Link>}
                {canEdit && !completed && <Link href={`/mapping/confirm?action=delete&activityId=${id}`} className="text-primary underline">{t("delete")}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
