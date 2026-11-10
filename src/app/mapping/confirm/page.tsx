import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/messages";
import { getCompletionReview, getOwnMapping } from "@/lib/services/mapping";
import { completeMappingAction, deleteActivityAction } from "../../mapping-actions";

export const dynamic = "force-dynamic";

export default async function MappingConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; activityId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t, locale } = await getT();
  const { action, activityId } = await searchParams;
  if (action !== "complete" && action !== "delete") notFound();

  const mapping = await getOwnMapping(user.actor);
  if (!mapping) redirect("/mapping");
  const activity = action === "delete" ? mapping.activities.find((a) => a.id === activityId) : null;
  if (action === "delete" && !activity) notFound();

  // Before completion: validate every activity and show what is unresolved.
  const review = action === "complete" ? await getCompletionReview(user.actor, mapping.campaign.id) : [];
  const withErrors = review.filter((i) => i.errors.length > 0);
  const withWarnings = review.filter((i) => i.warnings.length > 0);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{action === "complete" ? t("completionReviewTitle") : t("confirmTitle")}</h1>
      <p className="rounded bg-surface p-4">
        {action === "complete" ? t("confirmCompleteMapping") : `${t("confirmDeleteActivity")} ${activity?.version.name ?? ""}`}
      </p>

      {action === "complete" && (
        <>
          <p className="text-sm">{t("activityCountLabel")}: {review.length}</p>
          {withErrors.length > 0 && (
            <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">
              <p className="font-medium">{t("completionErrors")}</p>
              <ul className="list-disc pl-5">
                {withErrors.map((i) => (
                  <li key={i.activityId}>
                    <Link href={`/mapping/${i.activityId}`} className="underline">{i.name}</Link>: {i.errors.map((e) => msg(locale, e)).join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {withWarnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">{t("completionWarnings")}</p>
              <ul className="list-disc pl-5">
                {withWarnings.map((i) => (
                  <li key={i.activityId}>
                    <Link href={`/mapping/${i.activityId}`} className="underline">{i.name}</Link>:{" "}
                    {i.warnings.map((w) => t(w === "durationHigh" ? "warnDurationHigh" : "warnOccurrenceHigh")).join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {withErrors.length === 0 && withWarnings.length === 0 && <p className="text-sm text-primary">{t("completionAllGood")}</p>}
        </>
      )}

      <form action={action === "complete" ? completeMappingAction : deleteActivityAction} className="flex items-center gap-3">
        <input type="hidden" name="campaignId" value={mapping.campaign.id} />
        <input type="hidden" name="confirmed" value="yes" />
        {activity && <input type="hidden" name="activityId" value={activity.id} />}
        <button
          disabled={withErrors.length > 0}
          className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {t("confirmButton")}
        </button>
        <Link href="/mapping" className="text-primary underline">{t("back")}</Link>
      </form>
    </div>
  );
}
