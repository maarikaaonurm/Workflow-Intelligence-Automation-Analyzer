import { describe, expect, it } from "vitest";
import { diaryEntrySchema, type DiaryEntryInput } from "./schema";
import { minuteToTime, parseDiaryForm, timeToMinute } from "./form";
import {
  dayTotals,
  diaryPermissions,
  elapsedMinutes,
  observedMinutes,
  timerWarning,
  validateEntryDate,
  type EntryDateContext,
} from "./rules";
import { earliestEntryDate, entryToValues, logAgainValues } from "./present";
import { reminderDue } from "@/lib/services/diary";

const entry = (over: Partial<DiaryEntryInput> = {}): DiaryEntryInput => ({
  kind: "ACTIVITY",
  activityDate: "2026-11-20",
  initialActivityId: null,
  title: "Ad hoc checks",
  durationMinutes: 35,
  startMinute: null,
  endMinute: null,
  systemIds: [],
  volume: null,
  volumeUnitId: null,
  condition: "NORMAL",
  interrupted: false,
  outOfScope: false,
  note: null,
  improvementOpportunity: false,
  employeeSuggestion: null,
  meetingPurpose: null,
  meetingRecurrence: null,
  ...over,
});

describe("diary entry schema", () => {
  it("accepts a plain entry and a consolidated micro-activity (several cases in one entry)", () => {
    expect(diaryEntrySchema.safeParse(entry()).success).toBe(true);
    expect(diaryEntrySchema.safeParse(entry({ volume: 8, volumeUnitId: "cases" })).success).toBe(true);
  });

  it("keeps duration within 1 to 1440 minutes", () => {
    for (const bad of [0, -5, 1441, 12.5]) expect(diaryEntrySchema.safeParse(entry({ durationMinutes: bad })).success).toBe(false);
  });

  it("takes start and end time together, end after start, and allows them to overlap other entries", () => {
    expect(diaryEntrySchema.safeParse(entry({ startMinute: 540, endMinute: 600 })).success).toBe(true);
    expect(diaryEntrySchema.safeParse(entry({ startMinute: 540, endMinute: null })).success).toBe(false);
    expect(diaryEntrySchema.safeParse(entry({ startMinute: 600, endMinute: 540 })).success).toBe(false);
  });

  it("requires volume and unit together", () => {
    expect(diaryEntrySchema.safeParse(entry({ volume: 5 })).success).toBe(false);
    expect(diaryEntrySchema.safeParse(entry({ volumeUnitId: "u" })).success).toBe(false);
  });

  it("needs a purpose and recurrence for a meeting, and a meeting is never a mapped activity", () => {
    const meeting = entry({ kind: "MEETING", title: "Weekly sync" });
    expect(diaryEntrySchema.safeParse(meeting).success).toBe(false);
    expect(diaryEntrySchema.safeParse({ ...meeting, meetingPurpose: "PLANNING", meetingRecurrence: "RECURRING" }).success).toBe(true);
    expect(diaryEntrySchema.safeParse({ ...meeting, meetingPurpose: "PLANNING", meetingRecurrence: "AD_HOC", initialActivityId: "a1" }).success).toBe(false);
  });

  it("limits the note and keeps the condition marker to the four canonical values", () => {
    expect(diaryEntrySchema.safeParse(entry({ note: "x".repeat(501) })).success).toBe(false);
    expect(diaryEntrySchema.safeParse({ ...entry(), condition: "BAD" }).success).toBe(false);
    for (const c of ["NORMAL", "WAITING", "REWORK", "PROBLEM"]) expect(diaryEntrySchema.safeParse(entry({ condition: c as "NORMAL" })).success).toBe(true);
  });
});

describe("diary form parsing", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ kind: "ACTIVITY", activityDate: "2026-11-20", title: "Ad hoc checks", durationValue: "35", durationUnit: "minutes", ...fields })) f.set(k, v);
    return f;
  };

  it("converts hours to minutes and times to minutes since midnight", () => {
    const r = parseDiaryForm(form({ durationValue: "1.5", durationUnit: "hours", startTime: "08:30", endTime: "10:00" }));
    expect(r.ok && r.input).toMatchObject({ durationMinutes: 90, startMinute: 510, endMinute: 600 });
    expect(timeToMinute("23:59")).toBe(1439);
    expect(timeToMinute("24:00")).toBeNull();
    expect(minuteToTime(510)).toBe("08:30");
  });

  it("links a mapped activity and leaves the name to the server", () => {
    const r = parseDiaryForm(form({ initialActivityId: "act1", title: "" }));
    expect(r.ok && r.input).toMatchObject({ initialActivityId: "act1", title: "-" });
  });

  it("treats interruption and out of scope as flags, and defaults the condition to Normal", () => {
    const r = parseDiaryForm(form({ interrupted: "on", outOfScope: "on" }));
    expect(r.ok && r.input).toMatchObject({ interrupted: true, outOfScope: true, condition: "NORMAL" });
    const plain = parseDiaryForm(form({}));
    expect(plain.ok && plain.input).toMatchObject({ interrupted: false, outOfScope: false });
  });

  it("names invalid fields: no duration, bad time, end before start", () => {
    const r = parseDiaryForm(form({ durationValue: "0", startTime: "25:00" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields).toEqual(expect.arrayContaining(["durationMinutes", "startMinute"]));
    expect(parseDiaryForm(form({ startTime: "10:00", endTime: "09:00" })).ok).toBe(false);
  });

  it("parses a meeting with its purpose and recurrence and ignores mapped-activity fields", () => {
    const r = parseDiaryForm(form({ kind: "MEETING", title: "Team sync", meetingPurpose: "INFORMATION_SHARING", meetingRecurrence: "RECURRING", initialActivityId: "x" }));
    expect(r.ok && r.input).toMatchObject({ kind: "MEETING", initialActivityId: null, meetingPurpose: "INFORMATION_SHARING" });
  });
});

describe("what a participant may do in each campaign state", () => {
  it("creates and deletes only while observation runs, edits also in the Review Window, confirms only there", () => {
    expect(diaryPermissions("ACTIVE")).toEqual({ create: true, edit: true, delete: true, confirm: false });
    expect(diaryPermissions("REVIEW_WINDOW")).toEqual({ create: false, edit: true, delete: false, confirm: true });
  });

  it("allows nothing before the start, after locking or once cancelled", () => {
    for (const s of ["DRAFT", "INITIAL_MAPPING", "LOCKED", "ANALYSIS_IN_PROGRESS", "MANAGER_REVIEW", "FINAL", "ARCHIVED", "CANCELLED"] as const) {
      expect(diaryPermissions(s)).toEqual({ create: false, edit: false, delete: false, confirm: false });
    }
  });
});

describe("entry date rules", () => {
  const base: EntryDateContext = {
    date: "2026-11-20",
    today: "2026-11-20",
    campaignStart: "2026-11-09",
    campaignEnd: "2026-11-27",
    retrospectiveWindowDays: 3,
    periods: [{ start: "2026-11-09", inactiveFrom: null }],
    excludedDates: [],
    participantStatus: "ACTIVE",
  };
  const check = (over: Partial<EntryDateContext>) => validateEntryDate({ ...base, ...over });

  it("allows today and the retrospective window, and no further back", () => {
    expect(check({})).toBeNull();
    expect(check({ date: "2026-11-17" })).toBeNull(); // 3 days back
    expect(check({ date: "2026-11-16" })).toBe("errDiaryRetroLimit"); // 4 days back
  });

  it("refuses the future and dates outside the campaign", () => {
    expect(check({ date: "2026-11-21" })).toBe("errDiaryFuture");
    expect(check({ date: "2026-11-08", retrospectiveWindowDays: 30 })).toBe("errDiaryBeforeStart");
    expect(check({ today: "2026-12-01", date: "2026-11-28", retrospectiveWindowDays: 30 })).toBe("errDiaryAfterEnd");
  });

  it("refuses absent days and days in an inactive participation gap, but allows the restored period", () => {
    expect(check({ excludedDates: ["2026-11-20"] })).toBe("errDiaryAbsentDate");
    const gap = [
      { start: "2026-11-09", inactiveFrom: "2026-11-16" },
      { start: "2026-11-20", inactiveFrom: null },
    ];
    expect(check({ periods: gap, date: "2026-11-18" })).toBe("errDiaryNotParticipating");
    expect(check({ periods: gap, date: "2026-11-20" })).toBeNull();
  });

  it("refuses new entries from a participant who was stopped or excluded, and before a late join", () => {
    expect(check({ participantStatus: "STOPPED" })).toBe("errDiaryNotParticipating");
    expect(check({ participantStatus: "EXCLUDED" })).toBe("errDiaryNotParticipating");
    expect(check({ periods: [{ start: "2026-11-19", inactiveFrom: null }], date: "2026-11-18" })).toBe("errDiaryNotParticipating");
  });

  it("computes the earliest date for the form", () => {
    expect(earliestEntryDate("2026-11-20", 3, "2026-11-09")).toBe("2026-11-17");
    expect(earliestEntryDate("2026-11-10", 3, "2026-11-09")).toBe("2026-11-09");
  });
});

describe("timer rules", () => {
  it("measures at least one minute and never stops itself", () => {
    expect(elapsedMinutes(new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T10:00:05Z"))).toBe(1);
    expect(elapsedMinutes(new Date("2026-11-20T10:00:00Z"), new Date("2026-11-20T11:30:00Z"))).toBe(90);
  });

  it("warns when far longer than the activity normally takes, or beyond the maximum, and otherwise stays quiet", () => {
    expect(timerWarning({ elapsed: 45, expectedMinutes: 30 })).toBeNull();
    expect(timerWarning({ elapsed: 100, expectedMinutes: 30 })).toBe("exceedsActivity");
    expect(timerWarning({ elapsed: 50, expectedMinutes: 10 })).toBeNull(); // below the 60-minute floor
    expect(timerWarning({ elapsed: 481, expectedMinutes: null })).toBe("exceedsMax");
    expect(timerWarning({ elapsed: 200, expectedMinutes: null, maxMinutes: 120 })).toBe("exceedsMax");
    expect(timerWarning({ elapsed: 300, expectedMinutes: null })).toBeNull();
  });
});

describe("parallel work and totals", () => {
  const e = (durationMinutes: number, startMinute: number | null, endMinute: number | null, outOfScope = false) => ({ durationMinutes, startMinute, endMinute, outOfScope });

  it("does not add overlapping explicit time ranges twice", () => {
    const r = observedMinutes([e(60, 540, 600), e(60, 570, 630)]);
    expect(r).toEqual({ recorded: 120, unique: 90, hasOverlap: true });
  });

  it("keeps recorded time as entered and adds untimed entries as they are", () => {
    expect(observedMinutes([e(60, 540, 600), e(30, null, null)])).toEqual({ recorded: 90, unique: 90, hasOverlap: false });
    expect(observedMinutes([e(60, 540, 600), e(60, 600, 660)])).toMatchObject({ unique: 120, hasOverlap: false });
    expect(observedMinutes([e(120, 540, 660), e(30, 560, 590)])).toMatchObject({ recorded: 150, unique: 120, hasOverlap: true });
  });

  it("shows out-of-scope time separately and leaves it out of the in-scope totals", () => {
    const t = dayTotals([e(60, null, null), e(120, null, null, true)]);
    expect(t).toMatchObject({ recorded: 60, unique: 60, outOfScope: 120, count: 2 });
  });
});

describe("reminders", () => {
  it("shows only when enabled, due, nothing is logged today and entries can still be created", () => {
    const base = { enabled: true, time: "16:00", nowHHMM: "16:30", entriesToday: 0, canCreate: true };
    expect(reminderDue(base)).toBe(true);
    expect(reminderDue({ ...base, enabled: false })).toBe(false);
    expect(reminderDue({ ...base, nowHHMM: "15:59" })).toBe(false);
    expect(reminderDue({ ...base, entriesToday: 1 })).toBe(false);
    expect(reminderDue({ ...base, canCreate: false })).toBe(false);
  });
});

describe("Log Again", () => {
  const stored = {
    kind: "ACTIVITY",
    activityDate: new Date("2026-11-12T00:00:00Z"),
    initialActivityId: "act1",
    title: "Bank receipt review",
    durationMinutes: 30,
    startMinute: 540,
    endMinute: 570,
    systems: [{ id: "sys1" }],
    volume: 40,
    volumeUnitId: "u1",
    condition: "REWORK",
    interrupted: true,
    outOfScope: false,
    note: "yesterday's note",
    improvementOpportunity: false,
    employeeSuggestion: null,
    meetingRecurrence: null,
    meetingPurpose: null,
  };

  it("reuses the activity, systems, unit and marker, but starts from today and asks to verify duration, volume and note", () => {
    const v = logAgainValues(stored, "2026-11-20");
    expect(v).toMatchObject({ activityDate: "2026-11-20", initialActivityId: "act1", systemIds: ["sys1"], volumeUnitId: "u1", condition: "REWORK", durationValue: "", volume: "", note: "", interrupted: "" });
  });

  it("shows an existing entry for editing with whole hours as hours", () => {
    expect(entryToValues({ ...stored, durationMinutes: 120 })).toMatchObject({ durationValue: "2", durationUnit: "hours", startTime: "09:00", endTime: "09:30" });
  });
});
