import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages, msg } from "@/lib/i18n/messages";
import { getOwnActivity } from "@/lib/services/mapping";
import { listReferenceData } from "@/lib/services/reference";
import { changedFields, localized, toCategoryOptions, versionToInput, versionToValues } from "@/lib/mapping/present";
import { toISODate } from "@/lib/campaigns/dates";
import { ActivityForm } from "@/components/ActivityForm";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { activityId } = await params;

  const { mapping, activity, latest } = await getOwnActivity(user.actor, activityId);
  if (!mapping.canEdit) redirect("/mapping");
  const { categories, units, systems } = await listReferenceData(user.actor, { participantView: true });

  // Inactive items stay selectable on activities that already use them.
  const categoryOptions = toCategoryOptions(categories, locale);
  if (!categoryOptions.some((c) => c.id === latest.primaryCategoryId)) {
    categoryOptions.push(...toCategoryOptions([{ ...latest.primaryCategory }], locale));
  }

  // Oldest first: the original baseline, then each refinement and what it changed.
  const history = [...activity.versions].reverse();
  const baseline = history[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{latest.name}</h1>
      <ActivityForm
        campaignId={mapping.campaign.id}
        activityId={activityId}
        initial={versionToValues(latest)}
        categories={categoryOptions}
        units={units.map((u) => ({ id: u.id, label: localized(u, locale) }))}
        systems={systems.map((s) => ({ id: s.id, label: s.name }))}
        labels={messages[locale]}
        versioningNote={mapping.completed}
      />

      <section className="space-y-2 border-t border-gray-200 pt-4">
        <h2 className="font-medium">{t("versionHistory")}</h2>
        <ul className="space-y-1 text-sm">
          {history.map((v, i) => {
            const changed = i === 0 ? [] : changedFields(versionToInput(history[i - 1]), versionToInput(v));
            return (
              <li key={v.id}>
                v{v.versionNumber} · {v.isBaseline ? t("versionBaseline") : i === 0 ? t("mapStatusDRAFT") : t("versionRefinement")} · {toISODate(v.createdAt)}
                {changed.length > 0 && (
                  <span className="text-gray-600"> · {t("changedFieldsLabel")}: {changed.map((f) => msg(locale, `field_${f}`)).join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
        {baseline.isBaseline && history.length > 1 && <p className="text-xs text-gray-500">{t("baselineNote")}</p>}
      </section>
    </div>
  );
}
