import { activityInputSchema, type ActivityInput } from "./schema";

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const yes = (f: FormData, key: string) => f.get(key) === "yes";

function optionalNumber(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Duration is entered as a number plus minutes or hours and stored canonically in minutes.
 * The older single `avgDurationMinutes` field is still accepted.
 */
export function durationMinutes(f: FormData): number {
  if (f.has("durationValue")) {
    const value = Number(text(f, "durationValue").replace(",", "."));
    const factor = text(f, "durationUnit") === "hours" ? 60 : 1;
    return Math.round(value * factor);
  }
  return Number(text(f, "avgDurationMinutes"));
}

export type ActivityFormResult = { ok: true; input: ActivityInput } | { ok: false; fields: string[] };

/** Converts the activity form into a validated input, or the names of the invalid fields. */
export function parseActivityForm(f: FormData): ActivityFormResult {
  const unit = text(f, "volumeUnitId");
  const suggestion = text(f, "employeeSuggestion");
  const candidate = {
    name: text(f, "name"),
    description: text(f, "description"),
    purpose: text(f, "purpose"),
    outputRecipient: text(f, "outputRecipient"),
    outputRecipientNote: text(f, "outputRecipient") === "OTHER" && text(f, "outputRecipientNote") !== "" ? text(f, "outputRecipientNote") : null,
    primaryCategoryId: text(f, "primaryCategoryId"),
    tags: text(f, "tags")
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean),
    frequency: text(f, "frequency"),
    occurrenceCount: Number(text(f, "occurrenceCount")),
    avgDurationMinutes: durationMinutes(f),
    volume: optionalNumber(text(f, "volume")),
    volumeUnitId: unit === "" ? null : unit,
    systemIds: f.getAll("systemIds").map(String).filter(Boolean),
    automationLevel: text(f, "automationLevel"),
    ruleBasedDegree: text(f, "ruleBasedDegree"),
    judgementDegree: text(f, "judgementDegree"),
    exceptionFrequency: text(f, "exceptionFrequency"),
    dataManuallyCopied: yes(f, "dataManuallyCopied"),
    needsInfoFromOthers: yes(f, "needsInfoFromOthers"),
    waiting: text(f, "waiting"),
    rework: text(f, "rework"),
    seasonality: text(f, "seasonality"),
    sensitiveData: f.getAll("sensitiveData").map(String),
    improvementOpportunity: f.get("improvementOpportunity") === "on",
    employeeSuggestion: suggestion === "" ? null : suggestion,
  };
  const result = activityInputSchema.safeParse(candidate);
  if (result.success) return { ok: true, input: result.data };
  return { ok: false, fields: [...new Set(result.error.issues.map((i) => String(i.path[0])))] };
}
