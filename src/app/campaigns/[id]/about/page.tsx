import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getCampaignDetail } from "@/lib/services/campaigns";
import { ErrorBanner } from "@/components/ErrorBanner";
import { acknowledgeAction } from "../../../campaign-actions";

export const dynamic = "force-dynamic";

export default async function AboutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { id } = await params;
  const { error } = await searchParams;
  const detail = await getCampaignDetail(user.actor, id);
  const acknowledgement = detail.own?.acknowledgement;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("aboutTitle")}</h1>
      <p className="text-gray-600">{detail.campaign.name}</p>
      <ErrorBanner code={error} t={t} />
      <ul className="list-disc space-y-2 pl-5">
        <li>{t("aboutWhy")}</li>
        <li>{t("aboutNotPerformance")}</li>
        <li>{t("aboutManagerSees")}</li>
        <li>{t("aboutAI")}</li>
        <li>{t("aboutRetention")}</li>
        <li>{t("aboutResults")}</li>
      </ul>
      {acknowledgement ? (
        <p className="rounded bg-surface p-3">
          {t("acknowledgedOn")} {acknowledgement.acknowledgedAt.toISOString().slice(0, 10)}
        </p>
      ) : (
        detail.own?.participant && (
          <form action={acknowledgeAction}>
            <input type="hidden" name="campaignId" value={id} />
            <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("iUnderstand")}</button>
          </form>
        )
      )}
      <Link href={`/campaigns/${id}`} className="text-primary underline">{detail.campaign.name}</Link>
    </div>
  );
}
