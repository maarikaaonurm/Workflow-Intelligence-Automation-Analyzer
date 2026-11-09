import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOwnMapping } from "@/lib/services/mapping";
import { completeMappingAction, deleteActivityAction } from "../../mapping-actions";

export const dynamic = "force-dynamic";

export default async function MappingConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; activityId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.role !== "EMPLOYEE") redirect("/");
  const { t } = await getT();
  const { action, activityId } = await searchParams;
  if (action !== "complete" && action !== "delete") notFound();

  const mapping = await getOwnMapping(user.actor);
  if (!mapping) redirect("/mapping");
  const activity = action === "delete" ? mapping.activities.find((a) => a.id === activityId) : null;
  if (action === "delete" && !activity) notFound();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <p className="rounded bg-surface p-4">
        {action === "complete" ? t("confirmCompleteMapping") : `${t("confirmDeleteActivity")} ${activity?.version.name ?? ""}`}
      </p>
      <form action={action === "complete" ? completeMappingAction : deleteActivityAction} className="flex items-center gap-3">
        <input type="hidden" name="campaignId" value={mapping.campaign.id} />
        <input type="hidden" name="confirmed" value="yes" />
        {activity && <input type="hidden" name="activityId" value={activity.id} />}
        <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("confirmButton")}</button>
        <Link href="/mapping" className="text-primary underline">{t("back")}</Link>
      </form>
    </div>
  );
}
