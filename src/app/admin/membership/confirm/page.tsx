import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/messages";
import { can } from "@/lib/auth/policy";
import { AppError } from "@/lib/errors";
import { safeReturnPath } from "@/lib/action-helpers";
import { CAMPAIGN_TIME_ZONE } from "@/lib/campaigns/dates";
import { getMembershipChangePreview } from "@/lib/services/users";
import { ErrorBanner } from "@/components/ErrorBanner";
import { confirmMembershipAction } from "../../../user-actions";

export const dynamic = "force-dynamic";

/**
 * The explicit confirmation step for adding, transferring or re-roling an existing user.
 * It only describes the change; nothing happens until "confirmed=yes" is submitted.
 */
export default async function MembershipConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; departmentId?: string; role?: string; returnTo?: string; error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { actor } = me;
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) redirect("/");
  const { t, locale } = await getT();
  const query = await searchParams;

  const role = z.enum(["EMPLOYEE", "MANAGER"]).safeParse(query.role);
  if (!query.userId || !query.departmentId || !role.success) redirect("/admin/departments");
  const returnTo = safeReturnPath(query.returnTo, `/admin/departments/${query.departmentId}`);

  let preview;
  try {
    preview = await getMembershipChangePreview(actor, query.userId, { departmentId: query.departmentId, role: role.data });
  } catch (e) {
    if (e instanceof AppError) redirect(`${returnTo}?error=${e.code}`);
    throw e;
  }

  const date = new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: CAMPAIGN_TIME_ZONE,
  }).format(new Date());
  const vars = {
    user: preview.user.name,
    to: preview.department.name,
    from: preview.fromDepartment?.name ?? "",
    date,
    previous: preview.replacedManager?.name ?? "",
  };

  if (preview.kind === "none") redirect(returnTo);

  const title =
    preview.kind === "transfer"
      ? fill(t("transferTitle"), vars)
      : preview.kind === "add"
        ? fill(t("addToDepartmentTitle"), vars)
        : fill(t("makeManagerTitle"), vars);
  const hasImpact = preview.impactedCampaigns.length > 0;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <ErrorBanner code={query.error} t={t} />

      <div className="space-y-2 rounded bg-surface p-4 text-sm">
        {preview.kind === "transfer" && (
          <>
            <p>{fill(t("transferBelongs"), vars)}</p>
            <p>{fill(t("transferEffect"), vars)}</p>
            <p>{fill(t("transferPreserved"), vars)}</p>
          </>
        )}
        {preview.kind === "add" && <p>{fill(t("addNoDepartment"), vars)}</p>}
        {preview.kind === "roleChange" && <p>{fill(t("roleChangeBody"), vars)}</p>}
        {preview.role === "MANAGER" && preview.kind === "transfer" && <p>{t("transferAsManager")}</p>}
        {preview.replacedManager && <p>{fill(t("managerReplaceNote"), vars)}</p>}
      </div>

      {hasImpact && (
        <div role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium">{fill(t("campaignWarning1"), vars)}</p>
          <ul className="list-disc pl-5">
            {preview.impactedCampaigns.map((c) => (
              <li key={c.id}>{c.name} · {t(`status${c.status}`)}</li>
            ))}
          </ul>
          <p>{t("campaignWarning2")}</p>
          <p>{t("campaignWarning3")}</p>
        </div>
      )}

      <form action={confirmMembershipAction} className="space-y-3">
        <input type="hidden" name="userId" value={query.userId} />
        <input type="hidden" name="departmentId" value={query.departmentId} />
        <input type="hidden" name="role" value={role.data} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="confirmed" value="yes" />
        {hasImpact && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="ackCampaigns" required className="mt-1" />
            {t("ackCampaigns")}
          </label>
        )}
        <div className="flex items-center gap-3">
          <Link href={returnTo} className="rounded border border-primary px-4 py-2 text-primary">{t("cancel")}</Link>
          <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">
            {preview.kind === "transfer" ? t("transferButton") : preview.kind === "add" ? t("addToDepartmentButton") : t("makeManagerButton")}
          </button>
        </div>
      </form>
    </div>
  );
}
