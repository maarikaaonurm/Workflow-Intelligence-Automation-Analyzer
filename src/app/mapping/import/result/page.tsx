import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOwnImportBatch } from "@/lib/services/mapping";

export const dynamic = "force-dynamic";

/** What exactly was and was not saved by a confirmed import. Only the participant's own batches. */
export default async function ImportResultPage({ searchParams }: { searchParams: Promise<{ batch?: string; again?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t } = await getT();
  const { batch: batchId, again } = await searchParams;
  if (!batchId) redirect("/mapping");
  const batch = await getOwnImportBatch(user.actor, batchId);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("importResultTitle")}</h1>
      {again === "1" && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{t("importResultAlready")}</p>}
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt>{t("importResultCreated")}</dt>
        <dd className="font-medium">{batch.successCount}</dd>
        <dt>{t("importResultWarnings")}</dt>
        <dd className="font-medium">{batch.warningCount}</dd>
        <dt>{t("importResultNotSaved")}</dt>
        <dd className="font-medium">{batch.errorCount}</dd>
        <dt>{t("importResultTemplate")}</dt>
        <dd className="font-medium">{batch.templateVersion} · {batch.templateLanguage}</dd>
      </dl>
      <p className="text-sm text-gray-600">{t("importResultEdit")}</p>
      <Link href="/mapping" className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("backToMapping")}</Link>
    </div>
  );
}
