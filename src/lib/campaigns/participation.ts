import type { ParticipationPeriod } from "./dates";
import type { CampaignStatus } from "./status";

export type ParticipantStatus = "ACTIVE" | "STOPPED" | "EXCLUDED";

/** Campaign states in which participants can still be removed or restored. */
const PARTICIPANT_EDITABLE: CampaignStatus[] = ["INITIAL_MAPPING", "ACTIVE", "REVIEW_WINDOW"];

export function canRemoveParticipant(campaign: CampaignStatus, participant: ParticipantStatus): boolean {
  return participant === "ACTIVE" && PARTICIPANT_EDITABLE.includes(campaign);
}

/** Never after observation data is locked: reopen rules apply from then on. */
export function canRestoreParticipant(campaign: CampaignStatus, participant: ParticipantStatus): boolean {
  return participant !== "ACTIVE" && PARTICIPANT_EDITABLE.includes(campaign);
}

/**
 * The date a removal or restoration takes effect: today, but never before the
 * campaign's observation start.
 */
export function effectiveDate(campaignStart: string, today: string): string {
  return today > campaignStart ? today : campaignStart;
}

/**
 * Periods whose data may enter the Final Analysis. A participant currently
 * excluded contributes nothing; restoring makes their active periods eligible
 * again. Data from inactive gaps is never eligible either way.
 */
export function analysisPeriods(status: ParticipantStatus, periods: ParticipationPeriod[]): ParticipationPeriod[] {
  return status === "EXCLUDED" ? [] : periods;
}

/** True when the date falls inside one of the participant's active periods. */
export function isActiveOn(date: string, periods: ParticipationPeriod[]): boolean {
  return periods.some((p) => date >= p.start && (p.inactiveFrom === null || date < p.inactiveFrom));
}
