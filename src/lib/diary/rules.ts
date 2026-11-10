import { isActiveOn, type ParticipantStatus } from "@/lib/campaigns/participation";
import type { ParticipationPeriod } from "@/lib/campaigns/dates";
import type { CampaignStatus } from "@/lib/campaigns/status";
import { DEFAULT_MAX_TIMER_MINUTES, TIMER_OVERRUN_FACTOR, TIMER_OVERRUN_FLOOR_MINUTES } from "./constants";

/** What a participant may do with diary entries in each campaign state. */
export function diaryPermissions(status: CampaignStatus): { create: boolean; edit: boolean; delete: boolean; confirm: boolean } {
  return {
    // New entries only while observation runs; the retrospective window never extends into the Review Window.
    create: status === "ACTIVE",
    delete: status === "ACTIVE",
    // The Review Window is for correcting existing entries and confirming the diary.
    edit: status === "ACTIVE" || status === "REVIEW_WINDOW",
    confirm: status === "REVIEW_WINDOW",
  };
}

export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface EntryDateContext {
  date: string;
  today: string;
  campaignStart: string;
  campaignEnd: string;
  retrospectiveWindowDays: number;
  periods: ParticipationPeriod[];
  excludedDates: string[];
  participantStatus: ParticipantStatus;
}

/**
 * Whether a new entry may be dated `date`. Returns a message key, or null when allowed.
 * An entry must fall on a day the participant was actively part of the campaign and has not
 * been marked absent, within the observation period and the retrospective window.
 */
export function validateEntryDate(c: EntryDateContext): string | null {
  if (c.participantStatus !== "ACTIVE") return "errDiaryNotParticipating";
  if (c.date > c.today) return "errDiaryFuture";
  if (c.date < c.campaignStart) return "errDiaryBeforeStart";
  if (c.date > c.campaignEnd) return "errDiaryAfterEnd";
  // Calendar days back from today: with a window of 3, today and the three previous days are allowed.
  if (c.date < addCalendarDays(c.today, -c.retrospectiveWindowDays)) return "errDiaryRetroLimit";
  if (c.excludedDates.includes(c.date)) return "errDiaryAbsentDate";
  if (!isActiveOn(c.date, c.periods)) return "errDiaryNotParticipating";
  return null;
}

/** Minutes between two instants, at least 1. */
export function elapsedMinutes(startedAt: Date, until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - startedAt.getTime()) / 60_000));
}

export type TimerWarning = "exceedsActivity" | "exceedsMax" | null;

/**
 * A running or stopped timer gets a warning when it is far longer than the activity's usual
 * duration, or longer than the maximum. It is only a prompt to check the time: a long timer is
 * never called inefficient and is never stopped automatically.
 */
export function timerWarning(args: { elapsed: number; expectedMinutes: number | null; maxMinutes?: number }): TimerWarning {
  const max = args.maxMinutes ?? DEFAULT_MAX_TIMER_MINUTES;
  if (args.elapsed > max) return "exceedsMax";
  if (args.expectedMinutes !== null && args.elapsed > Math.max(args.expectedMinutes * TIMER_OVERRUN_FACTOR, TIMER_OVERRUN_FLOOR_MINUTES)) {
    return "exceedsActivity";
  }
  return null;
}

export interface TimedEntry {
  durationMinutes: number;
  startMinute: number | null;
  endMinute: number | null;
}

/**
 * Recorded time is the sum of the entered durations. Unique observed time does not count
 * overlapping explicit time ranges twice: entries with start and end times are merged into
 * their union, and entries without times (which cannot be placed on the clock) are added as recorded.
 * Overlap is context ("parallel work"), never a finding.
 */
export function observedMinutes(entries: TimedEntry[]): { recorded: number; unique: number; hasOverlap: boolean } {
  const recorded = entries.reduce((n, e) => n + e.durationMinutes, 0);
  const untimed = entries.filter((e) => e.startMinute === null || e.endMinute === null).reduce((n, e) => n + e.durationMinutes, 0);
  const ranges = entries
    .filter((e): e is TimedEntry & { startMinute: number; endMinute: number } => e.startMinute !== null && e.endMinute !== null)
    .map((e) => [e.startMinute, e.endMinute] as const)
    .sort((a, b) => a[0] - b[0]);

  let timedUnique = 0;
  let timedSum = 0;
  let currentStart = -1;
  let currentEnd = -1;
  for (const [start, end] of ranges) {
    timedSum += end - start;
    if (start > currentEnd) {
      if (currentEnd > currentStart) timedUnique += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  if (currentEnd > currentStart) timedUnique += currentEnd - currentStart;

  return { recorded, unique: untimed + timedUnique, hasOverlap: timedUnique < timedSum };
}

/** Whole-day totals for one date. Out-of-scope time is shown separately and never mixed into the rest. */
export function dayTotals(entries: (TimedEntry & { outOfScope: boolean })[]) {
  const inScope = observedMinutes(entries.filter((e) => !e.outOfScope));
  const outOfScope = entries.filter((e) => e.outOfScope).reduce((n, e) => n + e.durationMinutes, 0);
  return { ...inScope, outOfScope, count: entries.length };
}
