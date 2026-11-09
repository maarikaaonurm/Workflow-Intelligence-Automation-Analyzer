import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getCampaignDetail } from "@/lib/services/campaigns";
import { todayISO, toISODate } from "@/lib/campaigns/dates";
import { effectiveDate } from "@/lib/campaigns/participation";
import {
  cancelCampaignAction,
  lockCampaignAction,
  removeParticipantAction,
  restoreParticipantAction,
} from "../../../campaign-actions";

export const dynamic = "force-dynamic";

const ACTIONS = ["stop", "exclude", "restore", "cancel", "lock"] as const;
type ConfirmAction = (typeof ACTIONS)[number];

/** Explains a consequential action and its effective date, then asks for explicit confirmation. */
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string; participantId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  const { id } = await params;
  const { action, participantId } = await searchParams;
  if (!ACTIONS.includes(action as ConfirmAction)) notFound();

  const d = await getCampaignDetail(user.actor, id);
  if (!d.canManage) redirect(`/campaigns/${id}?error=errForbidden`);

  const kind = action as ConfirmAction;
  const needsParticipant = kind === "stop" || kind === "exclude" || kind === "restore";
  const participant = needsParticipant ? d.participants.find((p) => p.id === participantId) : null;
  if (needsParticipant && !participant) notFound();

  const date = effectiveDate(toISODate(d.campaign.startDate), todayISO());
  const message =
    kind === "stop"
      ? d.campaign.status === "DRAFT"
        ? t("confirmRemoveDraft")
        : t("confirmStop")
      : kind === "exclude"
        ? t("confirmExclude")
        : kind === "restore"
          ? t("confirmRestore")
          : kind === "cancel"
            ? t("confirmCancel")
            : t("confirmLock");

  const formAction =
    kind === "restore"
      ? restoreParticipantAction
      : kind === "cancel"
        ? cancelCampaignAction
        : kind === "lock"
          ? lockCampaignAction
          : removeParticipantAction;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("confirmTitle")}</h1>
      <p className="text-gray-600">
        {d.campaign.name}
        {participant ? ` · ${participant.user.name}` : ""}
      </p>
      <p className="rounded bg-surface p-4">{message.replace("{date}", date)}</p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="campaignId" value={id} />
        <input type="hidden" name="confirmed" value="yes" />
        {participant && <input type="hidden" name="participantId" value={participant.id} />}
        {(kind === "stop" || kind === "exclude") && (
          <input type="hidden" name="mode" value={kind === "exclude" ? "EXCLUDE_DATA" : "STOP_KEEP_DATA"} />
        )}
        <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">{t("confirmButton")}</button>
        <Link href={`/campaigns/${id}`} className="text-primary underline">{t("back")}</Link>
      </form>
    </div>
  );
}
