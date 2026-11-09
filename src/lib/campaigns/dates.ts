import type { CampaignStatus } from "./status";

/** Dates are ISO calendar strings (YYYY-MM-DD) so comparisons are plain string comparisons. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CAMPAIGN_TIME_ZONE = "Europe/Tallinn";

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CAMPAIGN_TIME_ZONE }).format(now);
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isRealDate(iso: string): boolean {
  return ISO_DATE.test(iso) && toISODate(fromISODate(iso)) === iso;
}

export interface CampaignPeriod {
  startDate: string;
  endDate: string;
  reviewWindowDays: number;
  retrospectiveWindowDays: number;
}

/** Returns error codes (message keys); empty when valid. */
export function validateCampaignPeriod(p: CampaignPeriod): string[] {
  const errors: string[] = [];
  if (!isRealDate(p.startDate) || !isRealDate(p.endDate)) errors.push("errInvalidDate");
  else if (p.endDate < p.startDate) errors.push("errEndBeforeStart");
  if (!Number.isInteger(p.reviewWindowDays) || p.reviewWindowDays < 0 || p.reviewWindowDays > 5) {
    errors.push("errReviewWindowRange");
  }
  if (!Number.isInteger(p.retrospectiveWindowDays) || p.retrospectiveWindowDays < 0 || p.retrospectiveWindowDays > 14) {
    errors.push("errRetrospectiveRange");
  }
  return errors;
}

/**
 * After launch the start date is fixed; the end date may be shortened or extended
 * only while observation has not ended.
 */
export function validateEndDateChange(args: {
  status: CampaignStatus;
  startDate: string;
  newEndDate: string;
  today: string;
}): string | null {
  if (!isRealDate(args.newEndDate)) return "errInvalidDate";
  if (args.status !== "INITIAL_MAPPING" && args.status !== "ACTIVE") return "errEndDateLocked";
  if (args.newEndDate < args.startDate) return "errEndBeforeStart";
  if (args.newEndDate < args.today) return "errEndInPast";
  return null;
}

function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

function isWeekday(iso: string): boolean {
  const day = fromISODate(iso).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Monday-Friday dates in [from, to], inclusive. */
export function weekdaysBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekday(d)) result.push(d);
  }
  return result;
}

export interface ObservationWindow {
  campaignStart: string;
  campaignEnd: string;
  /** Participant's own start (campaign start, or the late join date). */
  joinedAt: string;
  /** Date participation stopped, when the participant was removed. */
  stoppedAt?: string | null;
  /** Optional upper bound, e.g. today for a preliminary analysis. */
  through?: string | null;
}

/** Weekdays in the participant's observation range, including excluded ones. */
export function observationDates(w: ObservationWindow): string[] {
  const from = w.joinedAt > w.campaignStart ? w.joinedAt : w.campaignStart;
  let to = w.campaignEnd;
  if (w.stoppedAt && w.stoppedAt < to) to = w.stoppedAt;
  if (w.through && w.through < to) to = w.through;
  return from > to ? [] : weekdaysBetween(from, to);
}

export interface CoverageSummary {
  eligibleDays: number;
  excludedDays: number;
  daysWithEntries: number;
}

/**
 * Informational coverage for one participant. Absent / out-of-scope dates are not
 * eligible and never count as missing. This is context, never a score.
 */
export function coverage(
  window: ObservationWindow,
  excludedDates: Iterable<string>,
  diaryDates: Iterable<string>,
): CoverageSummary {
  const excluded = new Set(excludedDates);
  const all = observationDates(window);
  const eligible = all.filter((d) => !excluded.has(d));
  const entries = new Set(diaryDates);
  return {
    eligibleDays: eligible.length,
    excludedDays: all.length - eligible.length,
    daysWithEntries: eligible.filter((d) => entries.has(d)).length,
  };
}
