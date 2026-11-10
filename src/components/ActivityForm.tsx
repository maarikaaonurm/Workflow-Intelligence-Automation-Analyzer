"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { saveActivityAction, type ActivityFormState } from "@/app/mapping-actions";
import {
  AUTOMATION_LEVELS,
  DEGREES,
  EXCEPTION_FREQUENCIES,
  FREQUENCIES,
  OCCURRENCE_LEVELS,
  OUTPUT_RECIPIENTS,
  SEASONALITIES,
  SENSITIVE_CATEGORIES,
} from "@/lib/mapping/options";

type Option = { id: string; label: string };
type CategoryOption = Option & {
  definition: string;
  belongsHere: string;
  notBelongsHere: string;
  boundaryExamples: string | null;
};
type Values = Record<string, string | string[]>;

interface Props {
  campaignId: string;
  activityId?: string;
  initial: Values;
  categories: CategoryOption[];
  units: Option[];
  systems: Option[];
  /** UI strings for the current language. */
  labels: Record<string, string>;
  /** Shown above the form when this edit will create a new version rather than change a draft. */
  versioningNote?: boolean;
}

/** The four progressive sections and the fields each one holds (used to jump to the first invalid one). */
const STEP_OF_FIELD: Record<string, number> = {
  name: 1, description: 1, purpose: 1, outputRecipient: 1, outputRecipientNote: 1, primaryCategoryId: 1, tags: 1,
  frequency: 2, occurrenceCount: 2, avgDurationMinutes: 2, volume: 2, volumeUnitId: 2, seasonality: 2,
  systemIds: 3, automationLevel: 3, ruleBasedDegree: 3, judgementDegree: 3, exceptionFrequency: 3,
  dataManuallyCopied: 3, needsInfoFromOthers: 3, waiting: 3, rework: 3,
  sensitiveData: 4, improvementOpportunity: 4, employeeSuggestion: 4,
};
const STEPS = [1, 2, 3, 4] as const;

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
const invalid = "border-red-500";

export function ActivityForm({ campaignId, activityId, initial, categories, units, systems, labels, versioningNote }: Props) {
  const [state, formAction, pending] = useActionState<ActivityFormState, FormData>(saveActivityAction, {});
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

  const [step, setStep] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categoryId, setCategoryId] = useState(str("primaryCategoryId"));
  const [recipient, setRecipient] = useState(str("outputRecipient"));
  // "No Sensitive Data" excludes every other category.
  const [sensitive, setSensitive] = useState<string[]>(list("sensitiveData"));

  // After a refused save, show the first section that has an invalid field and keep the entries.
  useEffect(() => {
    if (state.fields && state.fields.length > 0) {
      setStep(Math.min(...state.fields.map((f) => STEP_OF_FIELD[f] ?? 4)));
    }
    if (state.error) {
      setDirty(true);
      setSubmitting(false);
    }
  }, [state]);

  // Warn before leaving with unsaved entries.
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

  function toggleSensitive(option: string, checked: boolean) {
    setSensitive((current) => {
      if (!checked) return current.filter((c) => c !== option);
      return option === "NONE" ? ["NONE"] : [...current.filter((c) => c !== "NONE"), option];
    });
  }

  const cls = (name: string) => `${input} ${bad.has(name) ? invalid : ""}`;
  const selectedCategory = categories.find((c) => c.id === categoryId);

  const select = (name: string, prefix: string, options: readonly string[], onChange?: (v: string) => void) => (
    <select
      name={name}
      defaultValue={str(name)}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={cls(name)}
    >
      <option value="">{t("select")}</option>
      {options.map((o) => (
        <option key={o} value={o}>{t(`${prefix}${o}`)}</option>
      ))}
    </select>
  );

  const yesNo = (name: string) => (
    <div className={`flex gap-4 text-sm ${bad.has(name) ? "rounded border border-red-500 p-1" : ""}`}>
      {["yes", "no"].map((v) => (
        <label key={v} className="flex items-center gap-1">
          <input type="radio" name={name} value={v} defaultChecked={str(name) === v} />
          {t(v)}
        </label>
      ))}
    </div>
  );

  const field = (label: string, control: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {control}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );

  const section = (n: number, title: string, children: React.ReactNode) => (
    <section hidden={step !== n} aria-labelledby={`step-${n}`} className="space-y-4">
      <h2 id={`step-${n}`} className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );

  return (
    <form
      action={formAction}
      // The server validates everything; native validation would block saving from a hidden step.
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setSubmitting(true)}
      className="space-y-4"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      {activityId && <input type="hidden" name="activityId" value={activityId} />}

      {versioningNote && <p className="rounded bg-surface p-3 text-sm">{t("versioningNote")}</p>}
      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(state.error)}
          {state.fields && state.fields.length > 0 ? ` (${state.fields.map((f) => t(`field_${f}`)).join(", ")})` : ""}
        </p>
      )}

      <nav aria-label={t("stepOf").replace("{n}", String(step))} className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            aria-current={step === n ? "step" : undefined}
            className={`rounded border px-3 py-1 ${step === n ? "border-primary bg-primary text-white" : "border-gray-300 text-gray-700"}`}
          >
            {n}. {t(`step${n}`)}
          </button>
        ))}
      </nav>

      {section(
        1,
        t("step1"),
        <>
          {field(t("field_name"), <input name="name" maxLength={150} defaultValue={str("name")} className={cls("name")} />)}
          {field(t("field_description"), <textarea name="description" rows={2} maxLength={1000} defaultValue={str("description")} className={cls("description")} />)}
          {field(t("field_purpose"), <input name="purpose" maxLength={500} defaultValue={str("purpose")} className={cls("purpose")} />)}
          {field(
            t("field_primaryCategoryId"),
            <select
              name="primaryCategoryId"
              defaultValue={str("primaryCategoryId")}
              onChange={(e) => setCategoryId(e.target.value)}
              className={cls("primaryCategoryId")}
            >
              <option value="">{t("select")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>,
          )}
          <div className="rounded bg-surface p-3 text-sm" aria-live="polite">
            {selectedCategory ? (
              <div className="space-y-1">
                <p className="font-medium">{selectedCategory.label}</p>
                <p>{selectedCategory.definition}</p>
                <p><span className="font-medium">{t("belongsHere")}:</span> {selectedCategory.belongsHere}</p>
                <p><span className="font-medium">{t("notBelongsHere")}:</span> {selectedCategory.notBelongsHere}</p>
                {selectedCategory.boundaryExamples && (
                  <p><span className="font-medium">{t("boundaryExamples")}:</span> {selectedCategory.boundaryExamples}</p>
                )}
              </div>
            ) : (
              <p className="text-gray-600">{t("hintCategoryChoose")}</p>
            )}
            <Link href="/categories" target="_blank" className="mt-2 inline-block text-primary underline">{t("categoryGuideOpens")}</Link>
          </div>
          {field(t("field_tags"), <input name="tags" defaultValue={str("tags")} className={cls("tags")} />, t("hintTags"))}
          {field(t("field_outputRecipient"), select("outputRecipient", "recipient", OUTPUT_RECIPIENTS, setRecipient))}
          {recipient === "OTHER" &&
            field(t("field_outputRecipientNote"), <input name="outputRecipientNote" maxLength={200} defaultValue={str("outputRecipientNote")} className={cls("outputRecipientNote")} />)}
        </>,
      )}

      {section(
        2,
        t("step2"),
        <>
          <div className="grid grid-cols-2 gap-3">
            {field(t("field_frequency"), select("frequency", "freq", FREQUENCIES))}
            {field(
              t("field_occurrenceCount"),
              <input type="number" name="occurrenceCount" min={1} max={1000} defaultValue={str("occurrenceCount")} className={cls("occurrenceCount")} />,
              t("hintOccurrence"),
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field(
              t("field_durationValue"),
              <div className="flex gap-2">
                <input type="number" name="durationValue" min={0} step="any" defaultValue={str("durationValue")} className={cls("avgDurationMinutes")} />
                <select name="durationUnit" defaultValue={str("durationUnit", "minutes")} className={input} aria-label={t("field_durationValue")}>
                  <option value="minutes">{t("durationMinutes")}</option>
                  <option value="hours">{t("durationHours")}</option>
                </select>
              </div>,
            )}
            {field(t("field_seasonality"), select("seasonality", "season", SEASONALITIES), t("hintSeasonality"))}
          </div>
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
        </>,
      )}

      {section(
        3,
        t("step3"),
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
          <div className="grid grid-cols-3 gap-3">
            {field(t("field_automationLevel"), select("automationLevel", "auto", AUTOMATION_LEVELS))}
            {field(t("field_ruleBasedDegree"), select("ruleBasedDegree", "degree", DEGREES))}
            {field(t("field_judgementDegree"), select("judgementDegree", "degree", DEGREES))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field(t("field_exceptionFrequency"), select("exceptionFrequency", "exc", EXCEPTION_FREQUENCIES))}
            {field(t("field_waiting"), select("waiting", "occ", OCCURRENCE_LEVELS))}
            {field(t("field_rework"), select("rework", "occ", OCCURRENCE_LEVELS))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <fieldset className="text-sm">
              <legend className="font-medium">{t("field_dataManuallyCopied")}</legend>
              {yesNo("dataManuallyCopied")}
            </fieldset>
            <fieldset className="text-sm">
              <legend className="font-medium">{t("field_needsInfoFromOthers")}</legend>
              {yesNo("needsInfoFromOthers")}
            </fieldset>
          </div>
        </>,
      )}

      {section(
        4,
        t("step4"),
        <>
          <fieldset className={`text-sm ${bad.has("sensitiveData") ? "rounded border border-red-500 p-2" : ""}`}>
            <legend className="font-medium">{t("field_sensitiveData")}</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {SENSITIVE_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="sensitiveData"
                    value={c}
                    checked={sensitive.includes(c)}
                    onChange={(e) => toggleSensitive(c, e.target.checked)}
                  />
                  {t(`sens${c}`)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t("hintSensitive")}</p>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="improvementOpportunity" defaultChecked={str("improvementOpportunity") === "on"} />
            {t("field_improvementOpportunity")}
          </label>
          {field(
            t("field_employeeSuggestion"),
            <textarea name="employeeSuggestion" rows={2} maxLength={1000} defaultValue={str("employeeSuggestion")} className={cls("employeeSuggestion")} />,
          )}
        </>,
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={step === 1} onClick={() => setStep(step - 1)} className="rounded border border-primary px-3 py-1 text-sm text-primary disabled:opacity-40">
          {t("previous")}
        </button>
        <button type="button" disabled={step === 4} onClick={() => setStep(step + 1)} className="rounded border border-primary px-3 py-1 text-sm text-primary disabled:opacity-40">
          {t("next")}
        </button>
        <span className="text-sm text-gray-500">{t("stepOf").replace("{n}", String(step))}</span>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
        <button disabled={pending} className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-60">
          {t("saveActivity")}
        </button>
        <Link href="/mapping" className="text-primary underline">{t("back")}</Link>
      </div>
    </form>
  );
}
