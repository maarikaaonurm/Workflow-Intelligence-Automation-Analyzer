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

/** Active over [start, inactiveFrom); inactiveFrom is the first inactive day (null = still active). */
export interface ParticipationPeriod {
  start: string;
  inactiveFrom: string | null;
}

export interface ObservationWindow {
  campaignStart: string;
  campaignEnd: string;
  /** The participant's active periods: the initial/late-join period plus any restorations. */
  periods: ParticipationPeriod[];
  /** Optional upper bound, e.g. today for a preliminary analysis. */
  through?: string | null;
}

/**
 * Weekdays on which the participant was actively part of the campaign, including
 * absent ones. Inactive gaps between periods never count.
 */
export function observationDates(w: ObservationWindow): string[] {
  const dates = new Set<string>();
  for (const period of w.periods) {
    const from = period.start > w.campaignStart ? period.start : w.campaignStart;
    let to = w.campaignEnd;
    if (period.inactiveFrom) {
      const lastActive = addDays(period.inactiveFrom, -1);
      if (lastActive < to) to = lastActive;
    }
    if (w.through && w.through < to) to = w.through;
    if (from > to) continue;
    for (const d of weekdaysBetween(from, to)) dates.add(d);
  }
  return [...dates].sort();
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
