import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { getOwnMapping } from "@/lib/services/mapping";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ImportForm } from "@/components/ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { error } = await searchParams;
  const mapping = await getOwnMapping(user.actor);
  if (!mapping || !mapping.canEdit) redirect("/mapping");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("importActivities")}</h1>
      <p className="text-sm text-gray-600">{t("importHelp")}</p>
      <ErrorBanner code={error} t={t} />
      <ImportForm campaignId={mapping.campaign.id} labels={messages[locale]} />
    </div>
  );
}
