"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import {
  acknowledgeAbout,
  addParticipant,
  cancelCampaign,
  changeEndDate,
  clearExcludedDate,
  createCampaign,
  createCampaignSchema,
  launchCampaign,
  lockCampaign,
  reopenCampaign,
  removeParticipant,
  setExcludedDate,
  setReminderPreference,
} from "@/lib/services/campaigns";

/** Runs a mutation, then redirects back; expected failures become an ?error=<message key>. */
async function attempt(returnTo: string, fn: () => Promise<void>, onSuccess: () => string = () => returnTo): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) redirect(`${returnTo}?error=${e.code}`);
    if (e instanceof z.ZodError) redirect(`${returnTo}?error=errInvalidInput`);
    throw e;
  }
  redirect(onSuccess());
}

const id = z.string().min(1);
const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function createCampaignAction(formData: FormData) {
  const { actor } = await requireUser();
  let createdId = "";
  await attempt(
    "/campaigns",
    async () => {
      const campaign = await createCampaign(
        actor,
        createCampaignSchema.parse({
          departmentId: str(formData, "departmentId"),
          name: str(formData, "name"),
          startDate: str(formData, "startDate"),
          endDate: str(formData, "endDate"),
          reviewWindowDays: str(formData, "reviewWindowDays"),
          retrospectiveWindowDays: str(formData, "retrospectiveWindowDays"),
          reminderTime: str(formData, "reminderTime"),
        }),
      );
      createdId = campaign.id;
    },
    () => `/campaigns/${createdId}`,
  );
}

export async function launchCampaignAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () => launchCampaign(actor, campaignId));
}

export async function cancelCampaignAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () => cancelCampaign(actor, campaignId));
}

export async function lockCampaignAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () => lockCampaign(actor, campaignId));
}

export async function reopenCampaignAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () => reopenCampaign(actor, campaignId, str(formData, "reason")));
}

export async function changeEndDateAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () => changeEndDate(actor, campaignId, str(formData, "endDate")));
}

export async function addParticipantAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const userId = id.parse(formData.get("userId"));
  await attempt(`/campaigns/${campaignId}`, () => addParticipant(actor, campaignId, userId));
}

export async function removeParticipantAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const participantId = id.parse(formData.get("participantId"));
  const mode = z.enum(["STOP_KEEP_DATA", "EXCLUDE_DATA"]).parse(formData.get("mode"));
  await attempt(`/campaigns/${campaignId}`, () => removeParticipant(actor, campaignId, participantId, mode));
}

export async function setExcludedDateAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const participantId = id.parse(formData.get("participantId"));
  await attempt(`/campaigns/${campaignId}`, () => setExcludedDate(actor, campaignId, participantId, str(formData, "date")));
}

export async function clearExcludedDateAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const excludedDateId = id.parse(formData.get("excludedDateId"));
  await attempt(`/campaigns/${campaignId}`, () => clearExcludedDate(actor, campaignId, excludedDateId));
}

export async function acknowledgeAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}/about`, () => acknowledgeAbout(actor, campaignId));
}

export async function setReminderAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt(`/campaigns/${campaignId}`, () =>
    setReminderPreference(actor, campaignId, str(formData, "time"), formData.get("enabled") === "on"),
  );
}
