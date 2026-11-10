import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { getUserDetail } from "@/lib/services/users";
import { ErrorBanner } from "@/components/ErrorBanner";
import { deactivateUserAction } from "../../../../user-actions";

export const dynamic = "force-dynamic";

export default async function DeactivateConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { actor } = me;
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) redirect("/");
  const { t } = await getT();
  const { id } = await params;
  const { error } = await searchParams;
  const { user, impactedCampaigns } = await getUserDetail(actor, id);
  if (user.isOrgAdmin || !user.active) redirect(`/admin/users/${id}`);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <p className="text-gray-600">{user.name}</p>
      <ErrorBanner code={error} t={t} />
      <p className="rounded bg-surface p-4">{t("confirmDeactivate")}</p>
      {impactedCampaigns.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">{t("campaignImpactTitle")}</p>
          <ul className="list-disc pl-5">
            {impactedCampaigns.map((c) => (
              <li key={c.id}>{c.name} · {t(`status${c.status}`)}</li>
            ))}
          </ul>
          <p className="mt-1">{t("campaignImpactNote")}</p>
        </div>
      )}
      <form action={deactivateUserAction} className="space-y-3">
        <input type="hidden" name="userId" value={id} />
        <input type="hidden" name="confirmed" value="yes" />
        {impactedCampaigns.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="ackCampaigns" className="mt-1" />
            {t("ackCampaigns")}
          </label>
        )}
        <div className="flex items-center gap-3">
          <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("confirmButton")}</button>
          <Link href={`/admin/users/${id}`} className="text-primary underline">{t("back")}</Link>
        </div>
      </form>
    </div>
  );
}
