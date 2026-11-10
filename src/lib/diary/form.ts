import { durationMinutes } from "@/lib/mapping/form";
import { diaryEntrySchema, type DiaryEntryInput } from "./schema";
import { SYSTEM_PLACEHOLDER_TITLE } from "./constants";

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

/** "08:30" -> 510; empty or malformed -> null. */
export function timeToMinute(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 510 -> "08:30". */
export function minuteToTime(minute: number | null): string {
  if (minute === null) return "";
  const h = Math.floor(minute / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function optionalNumber(value: string): number | null {
  if (value === "") return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export type DiaryFormResult = { ok: true; input: DiaryEntryInput } | { ok: false; fields: string[] };

/** Converts the diary form into a validated input, or the names of the invalid fields. */
export function parseDiaryForm(f: FormData): DiaryFormResult {
  const kind = text(f, "kind") === "MEETING" ? "MEETING" : "ACTIVITY";
  const activityId = text(f, "initialActivityId");
  const unit = text(f, "volumeUnitId");
  const start = text(f, "startTime");
  const end = text(f, "endTime");
  const note = text(f, "note");
  const suggestion = text(f, "employeeSuggestion");
  // An entry for a mapped activity carries the activity's name, filled in by the server.
  const title = kind === "ACTIVITY" && activityId !== "" ? SYSTEM_PLACEHOLDER_TITLE : text(f, "title");

  const candidate = {
    kind,
    activityDate: text(f, "activityDate"),
    initialActivityId: kind === "ACTIVITY" && activityId !== "" ? activityId : null,
    title,
    durationMinutes: durationMinutes(f),
    startMinute: start === "" ? null : timeToMinute(start),
    endMinute: end === "" ? null : timeToMinute(end),
    systemIds: f.getAll("systemIds").map(String).filter(Boolean),
    volume: optionalNumber(text(f, "volume")),
    volumeUnitId: unit === "" ? null : unit,
    condition: text(f, "condition") || "NORMAL",
    interrupted: f.get("interrupted") === "on",
    outOfScope: f.get("outOfScope") === "on",
    note: note === "" ? null : note,
    improvementOpportunity: f.get("improvementOpportunity") === "on",
    employeeSuggestion: suggestion === "" ? null : suggestion,
    meetingPurpose: kind === "MEETING" ? text(f, "meetingPurpose") || null : null,
    meetingRecurrence: kind === "MEETING" ? text(f, "meetingRecurrence") || null : null,
  };
  // A start or end that was typed but is not a valid time is reported instead of being dropped.
  const badTime = (start !== "" && candidate.startMinute === null) || (end !== "" && candidate.endMinute === null);
  const result = diaryEntrySchema.safeParse(candidate);
  const fields = result.success ? [] : [...new Set(result.error.issues.map((i) => String(i.path[0])))];
  if (badTime) fields.push("startMinute");
  if (result.success && !badTime) return { ok: true, input: result.data };
  return { ok: false, fields: [...new Set(fields)] };
}
