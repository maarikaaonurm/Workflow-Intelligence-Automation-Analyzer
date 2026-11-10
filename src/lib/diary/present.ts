import { durationFormValues } from "@/lib/mapping/present";
import { minuteToTime } from "./form";
import { addCalendarDays } from "./rules";

export type FormValues = Record<string, string | string[]>;

interface EntryLike {
  kind: string;
  activityDate: Date;
  initialActivityId: string | null;
  title: string;
  durationMinutes: number;
  startMinute: number | null;
  endMinute: number | null;
  systems: { id: string }[];
  volume: number | null;
  volumeUnitId: string | null;
  condition: string;
  interrupted: boolean;
  outOfScope: boolean;
  note: string | null;
  improvementOpportunity: boolean;
  employeeSuggestion: string | null;
  meetingRecurrence: string | null;
  meetingPurpose: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Form values for editing an entry. */
export function entryToValues(e: EntryLike): FormValues {
  return {
    activityDate: iso(e.activityDate),
    initialActivityId: e.initialActivityId ?? "",
    title: e.title,
    ...durationFormValues(e.durationMinutes),
    startTime: minuteToTime(e.startMinute),
    endTime: minuteToTime(e.endMinute),
    systemIds: e.systems.map((s) => s.id),
    volume: e.volume === null ? "" : String(e.volume),
    volumeUnitId: e.volumeUnitId ?? "",
    condition: e.condition,
    interrupted: e.interrupted ? "on" : "",
    outOfScope: e.outOfScope ? "on" : "",
    note: e.note ?? "",
    improvementOpportunity: e.improvementOpportunity ? "on" : "",
    employeeSuggestion: e.employeeSuggestion ?? "",
    meetingRecurrence: e.meetingRecurrence ?? "",
    meetingPurpose: e.meetingPurpose ?? "",
  };
}

/**
 * Log Again: reuses what is likely to repeat (activity, systems, unit, condition marker) but starts
 * from today with no duration, volume or note, so the participant must verify those.
 */
export function logAgainValues(e: EntryLike, today: string): FormValues {
  return {
    ...entryToValues(e),
    activityDate: today,
    durationValue: "",
    durationUnit: "minutes",
    startTime: "",
    endTime: "",
    volume: "",
    note: "",
    interrupted: "",
  };
}

/** The earliest date a new entry may have: today minus the retrospective window. */
export function earliestEntryDate(today: string, retrospectiveWindowDays: number, campaignStart: string): string {
  const back = addCalendarDays(today, -retrospectiveWindowDays);
  return back < campaignStart ? campaignStart : back;
}
