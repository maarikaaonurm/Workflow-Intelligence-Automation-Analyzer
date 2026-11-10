"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { quickAddAction, type QuickAddState } from "@/app/diary-actions";

type Option = { id: string; label: string };
interface Row {
  initialActivityId: string;
  title: string;
  activityDate: string;
  durationValue: string;
  durationUnit: string;
  volume: string;
  volumeUnitId: string;
  outOfScope: boolean;
}

interface Props {
  campaignId: string;
  activities: (Option & { avgMinutes: number })[];
  units: Option[];
  labels: Record<string, string>;
  today: string;
  minDate: string;
}

const input = "rounded border border-gray-300 px-2 py-1 text-sm";

/**
 * Quick Add: several entries in one go. Each row is checked on its own; valid rows are saved and
 * only the rows that need fixing stay on the screen, with their error.
 */
export function QuickAddForm({ campaignId, activities, units, labels, today, minDate }: Props) {
  const t = (key: string) => labels[key] ?? key;
  const blank = (): Row => ({ initialActivityId: "", title: "", activityDate: today, durationValue: "", durationUnit: "minutes", volume: "", volumeUnitId: "", outOfScope: false });
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [state, formAction, pending] = useActionState<QuickAddState, FormData>(quickAddAction, {});
  const [saved, setSaved] = useState(0);
  const [errors, setErrors] = useState<Record<number, string>>({});

  // After a save, keep only the rows that failed (with their errors) so nothing is lost silently.
  useEffect(() => {
    const result = state.result;
    if (!result) return;
    setSaved((n) => n + result.saved);
    const failed = new Set(result.errors.map((e) => e.index));
    setRows((current) => {
      const kept = current.filter((_, i) => failed.has(i));
      return kept.length > 0 ? kept : [blank()];
    });
    const remap: Record<number, string> = {};
    [...failed].sort((a, b) => a - b).forEach((oldIndex, newIndex) => {
      remap[newIndex] = result.errors.find((e) => e.index === oldIndex)!.code;
    });
    setErrors(remap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.result]);

  const update = (i: number, patch: Partial<Row>) => setRows((current) => current.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  // Only rows with something entered are submitted; empty rows are ignored.
  const filled = rows.filter((r) => r.durationValue !== "" || r.initialActivityId !== "" || r.title !== "");
  const payload = JSON.stringify(
    filled.map((r) => ({ ...r, outOfScope: r.outOfScope ? "on" : "" })),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="rows" value={payload} />

      {saved > 0 && <p role="status" className="rounded bg-surface p-3 text-sm">{t("quickSaved")}: {saved}</p>}
      {state.error && <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">{t(state.error)}</p>}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <fieldset key={i} className="space-y-2 rounded border border-gray-200 p-3 text-sm">
            <legend className="px-1 text-xs text-gray-500">{t("quickRow")} {i + 1}</legend>
            {errors[i] && <p role="alert" className="text-red-700">{t(errors[i])}</p>}
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={t("dfield_initialActivityId")} value={r.initialActivityId} onChange={(e) => update(i, { initialActivityId: e.target.value })} className={input}>
                <option value="">{t("newActivityOption")}</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              {r.initialActivityId === "" && (
                <input aria-label={t("dfield_title")} placeholder={t("dfield_title")} value={r.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={150} className={input} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label={t("dfield_activityDate")} value={r.activityDate} min={minDate} max={today} onChange={(e) => update(i, { activityDate: e.target.value })} className={input} />
              <input type="number" min={0} step="any" aria-label={t("dfield_durationValue")} placeholder={t("dfield_durationValue")} value={r.durationValue} onChange={(e) => update(i, { durationValue: e.target.value })} className={`${input} w-28`} />
              <select aria-label={t("dfield_durationValue")} value={r.durationUnit} onChange={(e) => update(i, { durationUnit: e.target.value })} className={input}>
                <option value="minutes">{t("durationMinutes")}</option>
                <option value="hours">{t("durationHours")}</option>
              </select>
              <input type="number" min={0} step="any" aria-label={t("field_volume")} placeholder={t("field_volume")} value={r.volume} onChange={(e) => update(i, { volume: e.target.value })} className={`${input} w-24`} />
              <select aria-label={t("field_volumeUnitId")} value={r.volumeUnitId} onChange={(e) => update(i, { volumeUnitId: e.target.value })} className={input}>
                <option value="">{t("none")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={r.outOfScope} onChange={(e) => update(i, { outOfScope: e.target.checked })} />
                {t("dfield_outOfScope")}
              </label>
              {rows.length > 1 && (
                <button type="button" onClick={() => setRows((c) => c.filter((_, idx) => idx !== i))} className="text-primary underline">
                  {t("removeRow")}
                </button>
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((c) => [...c, blank()])} className="rounded border border-primary px-3 py-1 text-sm text-primary">
          {t("addRow")}
        </button>
        <button disabled={pending || filled.length === 0} className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark disabled:opacity-60">
          {t("quickSave")}
        </button>
        <Link href="/diary" className="text-primary underline">{t("back")}</Link>
      </div>
    </form>
  );
}
