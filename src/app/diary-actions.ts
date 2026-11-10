"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { parseDiaryForm } from "@/lib/diary/form";
import { diaryEntrySchema, DIARY_SOURCES, type DiaryEntryInput } from "@/lib/diary/schema";
import { durationMinutes } from "@/lib/mapping/form";
import {
  confirmDiary,
  createEntriesBatch,
  createEntry,
  createEntryFromTimer,
  createSharedMeeting,
  deleteEntry,
  discardTimer,
  logSharedMeeting,
  startTimer,
  stopTimer,
  toggleFavorite,
  updateEntry,
  type BatchResult,
} from "@/lib/services/diary";

export interface DiaryFormState {
  error?: string;
  fields?: string[];
  /** Submitted values, so the form can be shown again without losing input. */
  values?: Record<string, string | string[]>;
}

function submittedValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    values[key] = all.length > 1 || key === "systemIds" ? all : (all[0] ?? "");
  }
  return values;
}

const id = z.string().min(1);
const str = (f: FormData, key: string) => String(f.get(key) ?? "");
const safeBack = (value: string, fallback: string) => (value.startsWith("/diary") && !value.includes("//") ? value : fallback);

/** Creates or edits an entry for the signed-in participant. Shows form errors in place; redirects to the diary on success. */
export async function saveEntryAction(_prev: DiaryFormState, formData: FormData): Promise<DiaryFormState> {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const entryId = str(formData, "entryId") || undefined;
  const sourceRaw = str(formData, "source");
  const source = (DIARY_SOURCES as readonly string[]).includes(sourceRaw) ? (sourceRaw as (typeof DIARY_SOURCES)[number]) : "MANUAL";

  const parsed = parseDiaryForm(formData);
  if (!parsed.ok) return { error: "errInvalidInput", fields: parsed.fields, values: submittedValues(formData) };
  try {
    if (entryId) await updateEntry(actor, entryId, parsed.input);
    else if (source === "TIMER") await createEntryFromTimer(actor, campaignId, parsed.input);
    else await createEntry(actor, campaignId, parsed.input, source);
  } catch (e) {
    if (e instanceof AppError) return { error: e.code, values: submittedValues(formData) };
    throw e;
  }
  redirect("/diary");
}

async function attempt(returnTo: string, fn: () => Promise<unknown>, onSuccess = returnTo): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${e.code}`);
    if (e instanceof z.ZodError) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=errInvalidInput`);
    throw e;
  }
  redirect(onSuccess);
}

export async function startTimerAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt("/diary/timer", () =>
    startTimer(actor, campaignId, { initialActivityId: str(formData, "initialActivityId") || null, title: str(formData, "title") }),
  );
}

/** Stopping only ends the clock: the participant reviews and saves the duration on the next page. */
export async function stopTimerAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  await attempt("/diary/timer", () => stopTimer(actor, campaignId), "/diary/new?source=TIMER");
}

export async function discardTimerAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  if (formData.get("confirmed") !== "yes") redirect("/diary/confirm?action=discardTimer");
  await attempt("/diary/timer", () => discardTimer(actor, campaignId), "/diary");
}

export async function deleteEntryAction(formData: FormData) {
  const { actor } = await requireUser();
  const entryId = id.parse(formData.get("entryId"));
  if (formData.get("confirmed") !== "yes") redirect(`/diary/confirm?action=delete&entryId=${entryId}`);
  await attempt("/diary", () => deleteEntry(actor, entryId));
}

export async function toggleFavoriteAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const activityId = id.parse(formData.get("activityId"));
  const back = safeBack(str(formData, "returnTo"), "/diary");
  await attempt(back, () => toggleFavorite(actor, campaignId, activityId));
}

export async function logSharedMeetingAction(formData: FormData) {
  const { actor } = await requireUser();
  const meetingId = id.parse(formData.get("meetingId"));
  await attempt("/diary", () => logSharedMeeting(actor, meetingId));
}

export async function confirmDiaryAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  if (formData.get("confirmed") !== "yes") redirect("/diary/confirm?action=confirmDiary");
  await attempt("/diary", () => confirmDiary(actor, campaignId));
}

export interface QuickAddState {
  error?: string;
  result?: BatchResult;
}

/** Quick Add: rows arrive as JSON from the form; each is validated on its own. */
export async function quickAddAction(_prev: QuickAddState, formData: FormData): Promise<QuickAddState> {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  let rows: unknown;
  try {
    rows = JSON.parse(str(formData, "rows") || "[]");
  } catch {
    return { error: "errInvalidInput" };
  }
  if (!Array.isArray(rows)) return { error: "errInvalidInput" };

  // Rows come from the compact quick-add form; fill in the defaults a full entry needs.
  const entries = rows.map((r: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(r)) f.set(k, String(v ?? ""));
    const activityId = String(r.initialActivityId ?? "");
    return {
      kind: "ACTIVITY",
      activityDate: String(r.activityDate ?? ""),
      initialActivityId: activityId === "" ? null : activityId,
      title: activityId === "" ? String(r.title ?? "") : "-",
      durationMinutes: durationMinutes(f),
      startMinute: null,
      endMinute: null,
      systemIds: [],
      volume: r.volume ? Number(r.volume) : null,
      volumeUnitId: r.volumeUnitId ? String(r.volumeUnitId) : null,
      condition: "NORMAL",
      interrupted: false,
      outOfScope: r.outOfScope === "on" || r.outOfScope === "true",
      note: r.note ? String(r.note) : null,
      improvementOpportunity: false,
      employeeSuggestion: null,
      meetingPurpose: null,
      meetingRecurrence: null,
    };
  });
  try {
    return { result: await createEntriesBatch(actor, campaignId, entries) };
  } catch (e) {
    if (e instanceof AppError) return { error: e.code };
    throw e;
  }
}

/** Logs a meeting: for yourself only, or defined once for others to add to their own diary. */
export async function saveMeetingAction(_prev: DiaryFormState, formData: FormData): Promise<DiaryFormState> {
  const { actor } = await requireUser();
  const campaignId = id.parse(formData.get("campaignId"));
  const f = new FormData();
  for (const [k, v] of formData.entries()) if (typeof v === "string") f.set(k, v);
  f.set("kind", "MEETING");
  const parsed = parseDiaryForm(f);
  if (!parsed.ok) return { error: "errInvalidInput", fields: parsed.fields, values: submittedValues(formData) };
  const input: DiaryEntryInput = diaryEntrySchema.parse(parsed.input);
  const entryId = str(formData, "entryId");
  try {
    if (entryId) {
      await updateEntry(actor, entryId, input);
    } else if (formData.get("shared") === "on") {
      await createSharedMeeting(actor, campaignId, {
        title: input.title,
        meetingDate: input.activityDate,
        durationMinutes: input.durationMinutes,
        recurrence: input.meetingRecurrence!,
        purpose: input.meetingPurpose!,
        note: input.note,
      });
    } else {
      await createEntry(actor, campaignId, input, "MEETING");
    }
  } catch (e) {
    if (e instanceof AppError) return { error: e.code, values: submittedValues(formData) };
    throw e;
  }
  redirect("/diary");
}
