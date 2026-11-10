import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnMapping } from "@/lib/services/mapping";
import { listReferenceData } from "@/lib/services/reference";
import { localized } from "@/lib/mapping/present";
import { ActivityForm } from "@/components/ActivityForm";

export const dynamic = "force-dynamic";

export default async function NewActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const mapping = await getOwnMapping(user.actor);
  if (!mapping || !mapping.canEdit) redirect("/mapping");
  const { categories, units, systems } = await listReferenceData(user.actor, { participantView: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("addActivity")}</h1>
      <ActivityForm
        campaignId={mapping.campaign.id}
        initial={{}}
        categories={categories.map((c) => ({ id: c.id, label: localized(c, locale) }))}
        units={units.map((u) => ({ id: u.id, label: localized(u, locale) }))}
        systems={systems.map((s) => ({ id: s.id, label: s.name }))}
        labels={messages[locale]}
      />
      <Link href="/mapping" className="hidden">{t("back")}</Link>
    </div>
  );
}
