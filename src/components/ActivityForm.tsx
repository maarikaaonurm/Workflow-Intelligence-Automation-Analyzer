"use client";

import { useActionState, useState } from "react";
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
type Values = Record<string, string | string[]>;

interface Props {
  campaignId: string;
  activityId?: string;
  initial: Values;
  categories: Option[];
  units: Option[];
  systems: Option[];
  /** UI strings for the current language. */
  labels: Record<string, string>;
  /** Shown above the form when this edit will create a new version rather than change a draft. */
  versioningNote?: boolean;
}

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

  // "No Sensitive Data" excludes every other category.
  const [sensitive, setSensitive] = useState<string[]>(list("sensitiveData"));
  function toggleSensitive(option: string, checked: boolean) {
    setSensitive((current) => {
      if (!checked) return current.filter((c) => c !== option);
      return option === "NONE" ? ["NONE"] : [...current.filter((c) => c !== "NONE"), option];
    });
  }

  const cls = (name: string) => `${input} ${bad.has(name) ? invalid : ""}`;

  const select = (name: string, prefix: string, options: readonly string[]) => (
    <select name={name} required defaultValue={str(name)} className={cls(name)}>
      <option value="">{t("select")}</option>
      {options.map((o) => (
        <option key={o} value={o}>{t(`${prefix}${o}`)}</option>
      ))}
    </select>
  );

  const yesNo = (name: string) => (
    <div className="flex gap-4 text-sm">
      {["yes", "no"].map((v) => (
        <label key={v} className="flex items-center gap-1">
          <input type="radio" name={name} value={v} required defaultChecked={str(name, "no") === v} />
          {t(v === "yes" ? "yes" : "no")}
        </label>
      ))}
    </div>
  );

  const field = (name: string, label: string, control: React.ReactNode, hint?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {control}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {activityId && <input type="hidden" name="activityId" value={activityId} />}

      {versioningNote && <p className="rounded bg-surface p-3 text-sm">{t("versioningNote")}</p>}
      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(state.error)}
          {state.fields && state.fields.length > 0 ? ` (${state.fields.map((f) => t(`field_${f}`)).join(", ")})` : ""}
        </p>
      )}

      {field("name", t("field_name"), <input name="name" required maxLength={150} defaultValue={str("name")} className={cls("name")} />)}
      {field("description", t("field_description"), <textarea name="description" required rows={2} maxLength={1000} defaultValue={str("description")} className={cls("description")} />)}
      {field("purpose", t("field_purpose"), <input name="purpose" required maxLength={500} defaultValue={str("purpose")} className={cls("purpose")} />)}
      {field("outputRecipient", t("field_outputRecipient"), select("outputRecipient", "recipient", OUTPUT_RECIPIENTS))}

      <div className="grid grid-cols-2 gap-3">
        {field(
          "primaryCategoryId",
          t("field_primaryCategoryId"),
          <select name="primaryCategoryId" required defaultValue={str("primaryCategoryId")} className={cls("primaryCategoryId")}>
            <option value="">{t("select")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>,
        )}
        {field("tags", t("field_tags"), <input name="tags" defaultValue={str("tags")} className={cls("tags")} />, t("hintTags"))}
      </div>
      <Link href="/categories" target="_blank" className="text-sm text-primary underline">{t("categoryGuide")}</Link>

      <div className="grid grid-cols-3 gap-3">
        {field("frequency", t("field_frequency"), select("frequency", "freq", FREQUENCIES))}
        {field(
          "occurrenceCount",
          t("field_occurrenceCount"),
          <input type="number" name="occurrenceCount" required min={1} max={1000} defaultValue={str("occurrenceCount")} className={cls("occurrenceCount")} />,
          t("hintOccurrence"),
        )}
        {field(
          "avgDurationMinutes",
          t("field_avgDurationMinutes"),
          <input type="number" name="avgDurationMinutes" required min={1} max={1440} defaultValue={str("avgDurationMinutes")} className={cls("avgDurationMinutes")} />,
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field("volume", t("field_volume"), <input type="number" name="volume" min={0} step="any" defaultValue={str("volume")} className={cls("volume")} />, t("hintVolume"))}
        {field(
          "volumeUnitId",
          t("field_volumeUnitId"),
          <select name="volumeUnitId" defaultValue={str("volumeUnitId")} className={cls("volumeUnitId")}>
            <option value="">{t("none")}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>,
        )}
      </div>

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
        {field("automationLevel", t("field_automationLevel"), select("automationLevel", "auto", AUTOMATION_LEVELS))}
        {field("ruleBasedDegree", t("field_ruleBasedDegree"), select("ruleBasedDegree", "degree", DEGREES))}
        {field("judgementDegree", t("field_judgementDegree"), select("judgementDegree", "degree", DEGREES))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {field("exceptionFrequency", t("field_exceptionFrequency"), select("exceptionFrequency", "exc", EXCEPTION_FREQUENCIES))}
        {field("waiting", t("field_waiting"), select("waiting", "occ", OCCURRENCE_LEVELS))}
        {field("rework", t("field_rework"), select("rework", "occ", OCCURRENCE_LEVELS))}
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
      {field("seasonality", t("field_seasonality"), select("seasonality", "season", SEASONALITIES), t("hintSeasonality"))}

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
        "employeeSuggestion",
        t("field_employeeSuggestion"),
        <textarea name="employeeSuggestion" rows={2} maxLength={1000} defaultValue={str("employeeSuggestion")} className={cls("employeeSuggestion")} />,
      )}

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-60">
          {t("save")}
        </button>
        <Link href="/mapping" className="text-primary underline">{t("back")}</Link>
      </div>
    </form>
  );
}
