import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnActivity } from "@/lib/services/mapping";
import { listReferenceData } from "@/lib/services/reference";
import { localized, versionToValues } from "@/lib/mapping/present";
import { ActivityForm } from "@/components/ActivityForm";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { activityId } = await params;

  const { mapping, latest } = await getOwnActivity(user.actor, activityId);
  if (!mapping.canEdit) redirect("/mapping");
  const { categories, units, systems } = await listReferenceData(user.actor, { participantView: true });

  // Inactive items stay selectable on activities that already use them.
  const categoryOptions = categories.map((c) => ({ id: c.id, label: localized(c, locale) }));
  if (!categoryOptions.some((c) => c.id === latest.primaryCategoryId)) {
    categoryOptions.push({ id: latest.primaryCategoryId, label: localized(latest.primaryCategory, locale) });
  }

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
      <p className="text-xs text-gray-500">{t("versionCount")}: {latest.versionNumber}</p>
    </div>
  );
}
