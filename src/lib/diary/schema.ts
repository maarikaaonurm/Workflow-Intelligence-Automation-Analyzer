import { z } from "zod";
import { ISO_DATE } from "@/lib/campaigns/dates";
import { SYSTEM_PLACEHOLDER_TITLE } from "./constants";

export const CONDITIONS = ["NORMAL", "WAITING", "REWORK", "PROBLEM"] as const;
export const MEETING_PURPOSES = ["INFORMATION_SHARING", "DECISION_MAKING", "PROBLEM_SOLVING", "PLANNING", "OTHER"] as const;
export const MEETING_RECURRENCES = ["RECURRING", "AD_HOC"] as const;
export const DIARY_SOURCES = ["MANUAL", "TIMER", "FAVORITE", "LOG_AGAIN", "QUICK_ADD", "MEETING"] as const;

/** Validated content of one diary entry (an activity or a meeting). */
export const diaryEntrySchema = z
  .object({
    kind: z.enum(["ACTIVITY", "MEETING"]),
    activityDate: z.string().regex(ISO_DATE),
    /** A mapped activity, or null for a new free-text activity or a meeting. */
    initialActivityId: z.string().min(1).nullable(),
    title: z.string().trim().min(1).max(150),
    durationMinutes: z.number().int().min(1).max(1440),
    // Optional clock times, minutes since midnight. They may overlap other entries (parallel work).
    startMinute: z.number().int().min(0).max(1439).nullable(),
    endMinute: z.number().int().min(1).max(1440).nullable(),
    systemIds: z.array(z.string().min(1)).max(20),
    volume: z.number().positive().max(1_000_000_000).nullable(),
    volumeUnitId: z.string().min(1).nullable(),
    condition: z.enum(CONDITIONS),
    interrupted: z.boolean(),
    outOfScope: z.boolean(),
    note: z.string().trim().max(500).nullable(),
    improvementOpportunity: z.boolean(),
    employeeSuggestion: z.string().trim().max(1000).nullable(),
    meetingPurpose: z.enum(MEETING_PURPOSES).nullable(),
    meetingRecurrence: z.enum(MEETING_RECURRENCES).nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.startMinute === null) !== (v.endMinute === null)) {
      ctx.addIssue({ code: "custom", path: ["startMinute"], message: "start and end time go together" });
    } else if (v.startMinute !== null && v.endMinute !== null && v.endMinute <= v.startMinute) {
      ctx.addIssue({ code: "custom", path: ["endMinute"], message: "end must be after start" });
    }
    if ((v.volume === null) !== (v.volumeUnitId === null)) {
      ctx.addIssue({ code: "custom", path: ["volume"], message: "volume and unit go together" });
    }
    if (v.kind === "MEETING") {
      if (v.meetingPurpose === null) ctx.addIssue({ code: "custom", path: ["meetingPurpose"], message: "a meeting needs a purpose" });
      if (v.meetingRecurrence === null) ctx.addIssue({ code: "custom", path: ["meetingRecurrence"], message: "a meeting needs a recurrence" });
      if (v.initialActivityId !== null) ctx.addIssue({ code: "custom", path: ["initialActivityId"], message: "a meeting is not a mapped activity" });
    }
  });

export type DiaryEntryInput = z.infer<typeof diaryEntrySchema>;

/** Title used by the form when a mapped activity is chosen; the server replaces it with the activity's name. */
export { SYSTEM_PLACEHOLDER_TITLE };
