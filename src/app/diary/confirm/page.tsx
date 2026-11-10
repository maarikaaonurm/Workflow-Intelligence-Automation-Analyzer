import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOwnDiary, getOwnEntry } from "@/lib/services/diary";
import { confirmDiaryAction, deleteEntryAction, discardTimerAction } from "../../diary-actions";

export const dynamic = "force-dynamic";

const ACTIONS = ["delete", "discardTimer", "confirmDiary"] as const;

/** One confirmation page for the consequential diary actions. Nothing happens until it is confirmed. */
export default async function DiaryConfirmPage({ searchParams }: { searchParams: Promise<{ action?: string; entryId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.actor.departmentRole === null) redirect("/");
  const { t } = await getT();
  const { action, entryId } = await searchParams;
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) notFound();
  const diary = await getOwnDiary(user.actor);
  if (!diary) redirect("/diary");

  const entry = action === "delete" && entryId ? await getOwnEntry(user.actor, entryId) : null;
  if (action === "delete" && !entry) notFound();

  const message =
    action === "delete" ? `${t("confirmDeleteEntry")} ${entry?.title ?? ""}` : action === "discardTimer" ? t("confirmDiscardTimer") : t("confirmConfirmDiary");
  const formAction = action === "delete" ? deleteEntryAction : action === "discardTimer" ? discardTimerAction : confirmDiaryAction;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <p className="rounded bg-surface p-4">{message}</p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="confirmed" value="yes" />
        <input type="hidden" name="campaignId" value={diary.campaign.id} />
        {entry && <input type="hidden" name="entryId" value={entry.id} />}
        <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("confirmButton")}</button>
        <Link href="/diary" className="text-primary underline">{t("back")}</Link>
      </form>
    </div>
  );
}
