"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { saveEntryAction, saveMeetingAction, type DiaryFormState } from "@/app/diary-actions";
import { CONDITIONS, MEETING_PURPOSES, MEETING_RECURRENCES } from "@/lib/diary/schema";

type Option = { id: string; label: string };
type Values = Record<string, string | string[]>;

interface Props {
  campaignId: string;
  /** "entry" for an activity, "meeting" for a meeting. */
  mode: "entry" | "meeting";
  entryId?: string;
  /** How the entry came to be: MANUAL, FAVORITE, LOG_AGAIN or TIMER. */
  source: string;
  initial: Values;
  activities: (Option & { avgMinutes: number })[];
  systems: Option[];
  units: Option[];
  labels: Record<string, string>;
  /** Earliest and latest date a new entry may have (retrospective window). */
  minDate: string;
  maxDate: string;
  /** Review Window: the date is fixed. */
  dateLocked?: boolean;
  /** Shown above the form, for example the timer duration to confirm. */
  notice?: string;
}

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
const invalid = "border-red-500";

/** One form for activity entries and meetings: manual, favorite, Log Again and timer review all use it. */
export function DiaryForm({ campaignId, mode, entryId, source, initial, activities, systems, units, labels, minDate, maxDate, dateLocked, notice }: Props) {
  const [state, formAction, pending] = useActionState<DiaryFormState, FormData>(mode === "meeting" ? saveMeetingAction : saveEntryAction, {});
  const values: Values = state.values ?? initial;
  const bad = new Set(state.fields ?? []);
  const t = (key: string) => labels[key] ?? key;
  const str = (name: string, fallback = "") => {
    const v = values[name];
    return Array.isArray(v) ? (v[0] ?? fallback) : (v ?? fallback);
  };
  const list = (name: string): string[] => {
    const v = values[name];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const cls = (name: string) => `${input} ${bad.has(name) ? invalid : ""}`;

  const [activityId, setActivityId] = useState(str("initialActivityId"));
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.error) {
      setDirty(true);
      setSubmitting(false);
    }
  }, [state]);
  useEffect(() => {
    if (!dirty || submitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t("unsavedWarning");
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, submitting]);

  const field = (label: string, control: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {control}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );

  return (
    <form action={formAction} noValidate onChange={() => setDirty(true)} onSubmit={() => setSubmitting(true)} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="kind" value={mode === "meeting" ? "MEETING" : "ACTIVITY"} />
      {entryId && <input type="hidden" name="entryId" value={entryId} />}
      {dateLocked && <input type="hidden" name="activityDate" value={str("activityDate")} />}

      {notice && <p className="rounded bg-surface p-3 text-sm">{notice}</p>}
      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(state.error)}
          {state.fields && state.fields.length > 0 ? ` (${state.fields.map((f) => t(`dfield_${f}`)).join(", ")})` : ""}
        </p>
      )}

      {field(
        t("dfield_activityDate"),
        <input type="date" name={dateLocked ? undefined : "activityDate"} min={minDate} max={maxDate} defaultValue={str("activityDate", maxDate)} disabled={dateLocked} className={cls("activityDate")} />,
        dateLocked ? t("hintDateFixed") : t("hintRetro"),
      )}

      {mode === "entry" ? (
        <>
          {field(
            t("dfield_initialActivityId"),
            <select
              name="initialActivityId"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className={cls("initialActivityId")}
            >
              <option value="">{t("newActivityOption")}</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>,
          )}
          {activityId === "" &&
            field(t("dfield_title"), <input name="title" maxLength={150} defaultValue={str("title")} className={cls("title")} />, t("hintNewActivity"))}
        </>
      ) : (
        <>
          {field(t("dfield_title"), <input name="title" maxLength={150} defaultValue={str("title")} className={cls("title")} />)}
          <div className="grid grid-cols-2 gap-3">
            {field(
              t("dfield_meetingRecurrence"),
              <select name="meetingRecurrence" defaultValue={str("meetingRecurrence")} className={cls("meetingRecurrence")}>
                <option value="">{t("select")}</option>
                {MEETING_RECURRENCES.map((r) => (
                  <option key={r} value={r}>{t(`rec${r}`)}</option>
                ))}
              </select>,
            )}
            {field(
              t("dfield_meetingPurpose"),
              <select name="meetingPurpose" defaultValue={str("meetingPurpose")} className={cls("meetingPurpose")}>
                <option value="">{t("select")}</option>
                {MEETING_PURPOSES.map((p) => (
                  <option key={p} value={p}>{t(`purpose${p}`)}</option>
                ))}
              </select>,
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        {field(
          t("dfield_durationValue"),
          <div className="flex gap-2">
            <input type="number" name="durationValue" min={0} step="any" defaultValue={str("durationValue")} className={cls("durationMinutes")} />
            <select name="durationUnit" defaultValue={str("durationUnit", "minutes")} className={input} aria-label={t("dfield_durationValue")}>
              <option value="minutes">{t("durationMinutes")}</option>
              <option value="hours">{t("durationHours")}</option>
            </select>
          </div>,
        )}
        <div className="grid grid-cols-2 gap-2">
          {field(t("dfield_startTime"), <input type="time" name="startTime" defaultValue={str("startTime")} className={cls("startMinute")} />)}
          {field(t("dfield_endTime"), <input type="time" name="endTime" defaultValue={str("endTime")} className={cls("endMinute")} />, t("hintTimes"))}
        </div>
      </div>

      {mode === "entry" && (
        <>
          <fieldset className="text-sm">
            <legend className="font-medium">{t("field_systemIds")}</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {systems.map((s) => (
                <label key={s.id} className="flex items-center gap-1">
                  <input type="checkbox" name="systemIds" value={s.id} defaultChecked={list("systemIds").includes(s.id)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            {field(t("field_volume"), <input type="number" name="volume" min={0} step="any" defaultValue={str("volume")} className={cls("volume")} />, t("hintVolume"))}
            {field(
              t("field_volumeUnitId"),
              <select name="volumeUnitId" defaultValue={str("volumeUnitId")} className={cls("volumeUnitId")}>
                <option value="">{t("none")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>,
            )}
          </div>
          {field(
            t("dfield_condition"),
            <select name="condition" defaultValue={str("condition", "NORMAL")} className={cls("condition")}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{t(`cond${c}`)}</option>
              ))}
            </select>,
          )}
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="interrupted" defaultChecked={str("interrupted") === "on"} />
              {t("dfield_interrupted")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="outOfScope" defaultChecked={str("outOfScope") === "on"} />
              {t("dfield_outOfScope")}
            </label>
          </div>
          <p className="text-xs text-gray-500">{t("hintOutOfScope")}</p>
        </>
      )}

      {field(t("dfield_note"), <textarea name="note" rows={2} maxLength={500} defaultValue={str("note")} className={cls("note")} />, t("hintNote"))}

      {mode === "entry" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="improvementOpportunity" defaultChecked={str("improvementOpportunity") === "on"} />
            {t("field_improvementOpportunity")}
          </label>
          {field(t("field_employeeSuggestion"), <textarea name="employeeSuggestion" rows={2} maxLength={1000} defaultValue={str("employeeSuggestion")} className={cls("employeeSuggestion")} />)}
        </>
      )}

      {mode === "meeting" && !entryId && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="shared" defaultChecked={str("shared") === "on"} className="mt-1" />
          {t("meetingShareOption")}
        </label>
      )}

      <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
        <button disabled={pending} className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-60">
          {t("saveEntry")}
        </button>
        <Link href="/diary" className="text-primary underline">{t("back")}</Link>
      </div>
    </form>
  );
}
