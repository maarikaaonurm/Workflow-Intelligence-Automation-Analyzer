import { messages, type Locale } from "@/lib/i18n/messages";
import { activityInputSchema, type ActivityInput } from "./schema";
import { activityWarnings, duplicateSignals, type ActivityRef } from "./warnings";
import {
  AUTOMATION_LEVELS,
  DEGREES,
  EXCEPTION_FREQUENCIES,
  FREQUENCIES,
  OCCURRENCE_LEVELS,
  OUTPUT_RECIPIENTS,
  SEASONALITIES,
  SENSITIVE_CATEGORIES,
} from "./options";

export const MAX_IMPORT_ROWS = 200;

/** Template columns in order (canonical keys). `prefix` names the message family that holds the localized values. */
export const IMPORT_COLUMNS = [
  { key: "name", required: true, text: true },
  { key: "description", required: true, text: true },
  { key: "purpose", required: true, text: true },
  { key: "output_recipient", required: true, enumValues: OUTPUT_RECIPIENTS, prefix: "recipient" },
  { key: "output_recipient_note", required: false, text: true },
  { key: "primary_category", required: true },
  { key: "tags", required: false, text: true },
  { key: "frequency", required: true, enumValues: FREQUENCIES, prefix: "freq" },
  { key: "occurrence_count", required: true },
  { key: "avg_duration_minutes", required: true },
  { key: "volume", required: false },
  { key: "volume_unit", required: false },
  { key: "systems", required: false },
  { key: "automation_level", required: true, enumValues: AUTOMATION_LEVELS, prefix: "auto" },
  { key: "rule_based_degree", required: true, enumValues: DEGREES, prefix: "degree" },
  { key: "judgement_degree", required: true, enumValues: DEGREES, prefix: "degree" },
  { key: "exception_frequency", required: true, enumValues: EXCEPTION_FREQUENCIES, prefix: "exc" },
  { key: "data_manually_copied", required: true, yesNo: true },
  { key: "needs_info_from_others", required: true, yesNo: true },
  { key: "waiting", required: true, enumValues: OCCURRENCE_LEVELS, prefix: "occ" },
  { key: "rework", required: true, enumValues: OCCURRENCE_LEVELS, prefix: "occ" },
  { key: "seasonality", required: true, enumValues: SEASONALITIES, prefix: "season" },
  { key: "sensitive_data", required: true, enumValues: SENSITIVE_CATEGORIES, prefix: "sens" },
  { key: "improvement_opportunity", required: false, yesNo: true },
  { key: "employee_suggestion", required: false, text: true },
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export interface ImportReferences {
  categories: { id: string; nameEn: string; nameEt: string }[];
  units: { id: string; key: string; nameEn: string; nameEt: string }[];
  systems: { id: string; name: string }[];
  /** The participant's current activities (for duplicate warnings). */
  existing: ActivityRef[];
}

export type IssueCode =
  | "required"
  | "invalid"
  | "unknown"
  | "formula"
  | "durationHigh"
  | "occurrenceHigh"
  | "duplicateExisting"
  | "duplicateInFile"
  | "duplicateSimilar";

export interface ImportIssue {
  field: string;
  code: IssueCode;
  value?: string;
}

export type RowStatus = "READY" | "WARNING" | "ERROR";

/** What the preview shows for a row, resolved to readable labels. */
export interface RowPreview {
  name: string;
  category: string;
  frequency: string;
  occurrenceCount: string;
  avgDurationMinutes: string;
  volume: string;
  unit: string;
  systems: string[];
}

export interface ImportRow {
  rowNumber: number;
  status: RowStatus;
  /** Present only when the row has no errors. */
  input: ActivityInput | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  preview: RowPreview;
}

export function summarizeImport(rows: ImportRow[]) {
  return {
    ready: rows.filter((r) => r.status === "READY").length,
    warning: rows.filter((r) => r.status === "WARNING").length,
    error: rows.filter((r) => r.status === "ERROR").length,
  };
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
const enumKey = (v: string) => v.trim().toUpperCase().replace(/[\s-]+/g, "_");

/** Lower-cases a header and joins words with spaces: "Avg_Duration-Minutes *" -> "avg duration minutes". */
export function normalizeHeader(h: string): string {
  return h.replace(/\*/g, "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const LOCALES: Locale[] = ["et", "en"];
const label = (locale: Locale, key: string) => (messages[locale] as Record<string, string>)[key] ?? key;

/** Heading text (either language, or the canonical key) to canonical column key. */
export function headerLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const column of IMPORT_COLUMNS) {
    map.set(normalizeHeader(column.key), column.key);
    for (const locale of LOCALES) map.set(normalizeHeader(label(locale, `col_${column.key}`)), column.key);
  }
  return map;
}

/** Localized label (either language) or canonical code to canonical code, for one controlled-value family. */
function valueLookup<T extends string>(prefix: string, codes: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const code of codes) {
    map.set(norm(enumKey(code)), code);
    map.set(norm(code.replace(/_/g, " ")), code);
    for (const locale of LOCALES) map.set(norm(label(locale, `${prefix}${code}`)), code);
  }
  return map;
}

const yesWords = new Set(["yes", "y", "true", "1", ...LOCALES.map((l) => norm(label(l, "yes")))]);
const noWords = new Set(["no", "n", "false", "0", ...LOCALES.map((l) => norm(label(l, "no")))]);

function parseYesNo(v: string): boolean | null {
  const x = norm(v);
  if (yesWords.has(x)) return true;
  if (noWords.has(x)) return false;
  return null;
}

function splitList(v: string): string[] {
  return v
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A cell that starts like a spreadsheet formula is refused: it is never executed or stored as one. */
const FORMULA_START = /^[=+@\t\r]/;

/** Maps a schema field name (as reported by Zod) back to its template column. */
const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name",
  description: "description",
  purpose: "purpose",
  outputRecipient: "output_recipient",
  outputRecipientNote: "output_recipient_note",
  primaryCategoryId: "primary_category",
  tags: "tags",
  frequency: "frequency",
  occurrenceCount: "occurrence_count",
  avgDurationMinutes: "avg_duration_minutes",
  volume: "volume",
  volumeUnitId: "volume_unit",
  systemIds: "systems",
  automationLevel: "automation_level",
  ruleBasedDegree: "rule_based_degree",
  judgementDegree: "judgement_degree",
  exceptionFrequency: "exception_frequency",
  dataManuallyCopied: "data_manually_copied",
  needsInfoFromOthers: "needs_info_from_others",
  waiting: "waiting",
  rework: "rework",
  seasonality: "seasonality",
  sensitiveData: "sensitive_data",
  improvementOpportunity: "improvement_opportunity",
  employeeSuggestion: "employee_suggestion",
};

/**
 * Validates imported records against the same schema as the manual form, and normalizes
 * localized values (Estonian or English labels, or canonical codes) to canonical values.
 * `records` are keyed by canonical column key; row numbers are spreadsheet rows (header = 1).
 * Fully empty rows are skipped. Errors exclude a row from the import; warnings (duplicates,
 * unusual values) need the participant's confirmation.
 */
export function parseImportRecords(records: Record<string, string>[], refs: ImportReferences, locale: Locale = "en"): ImportRow[] {
  const lookups = {
    recipient: valueLookup("recipient", OUTPUT_RECIPIENTS),
    freq: valueLookup("freq", FREQUENCIES),
    auto: valueLookup("auto", AUTOMATION_LEVELS),
    degree: valueLookup("degree", DEGREES),
    exc: valueLookup("exc", EXCEPTION_FREQUENCIES),
    occ: valueLookup("occ", OCCURRENCE_LEVELS),
    season: valueLookup("season", SEASONALITIES),
    sens: valueLookup("sens", SENSITIVE_CATEGORIES),
  };
  const earlierInFile: ActivityRef[] = [];
  const rows: ImportRow[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    if (Object.values(record).every((v) => v.trim() === "")) return;

    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const get = (key: string) => (record[key] ?? "").trim();

    for (const column of IMPORT_COLUMNS) {
      if ("text" in column && FORMULA_START.test(record[column.key] ?? "")) errors.push({ field: column.key, code: "formula" });
    }
    const blocked = new Set(errors.map((e) => e.field));

    const requireValue = (key: string): string => {
      const v = get(key);
      if (v === "" && !blocked.has(key)) errors.push({ field: key, code: "required" });
      return blocked.has(key) ? "" : v;
    };
    const parseEnum = <T extends string>(key: string, lookup: Map<string, T>, required: boolean): T | undefined => {
      const v = required ? requireValue(key) : get(key);
      if (v === "") return undefined;
      const found = lookup.get(norm(v)) ?? lookup.get(norm(enumKey(v)));
      if (!found) errors.push({ field: key, code: "unknown", value: v });
      return found;
    };
    const parseBool = (key: string, required: boolean): boolean | undefined => {
      const v = required ? requireValue(key) : get(key);
      if (v === "") return required ? undefined : false;
      const b = parseYesNo(v);
      if (b === null) {
        errors.push({ field: key, code: "invalid", value: v });
        return undefined;
      }
      return b;
    };
    const parseNumber = (key: string, required: boolean): number | null | undefined => {
      const v = required ? requireValue(key) : get(key);
      if (v === "") return required ? undefined : null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n)) {
        errors.push({ field: key, code: "invalid", value: v });
        return undefined;
      }
      return n;
    };

    const name = requireValue("name");
    const description = requireValue("description");
    const purpose = requireValue("purpose");

    let primaryCategoryId: string | undefined;
    let categoryLabel = "";
    const categoryName = requireValue("primary_category");
    if (categoryName) {
      const match = refs.categories.find((c) => norm(c.nameEn) === norm(categoryName) || norm(c.nameEt) === norm(categoryName));
      if (match) {
        primaryCategoryId = match.id;
        categoryLabel = locale === "et" ? match.nameEt : match.nameEn;
      } else errors.push({ field: "primary_category", code: "unknown", value: categoryName });
    }

    let volumeUnitId: string | null = null;
    let unitLabel = "";
    const unitName = get("volume_unit");
    if (unitName) {
      const match = refs.units.find((u) => [u.key, u.nameEn, u.nameEt].some((x) => norm(x) === norm(unitName)));
      if (match) {
        volumeUnitId = match.id;
        unitLabel = locale === "et" ? match.nameEt : match.nameEn;
      } else errors.push({ field: "volume_unit", code: "unknown", value: unitName });
    }

    const systemIds: string[] = [];
    const systemLabels: string[] = [];
    for (const systemName of splitList(get("systems"))) {
      const match = refs.systems.find((s) => norm(s.name) === norm(systemName));
      if (match) {
        systemIds.push(match.id);
        systemLabels.push(match.name);
      } else errors.push({ field: "systems", code: "unknown", value: systemName });
    }

    const sensitiveData: (typeof SENSITIVE_CATEGORIES)[number][] = [];
    for (const item of splitList(requireValue("sensitive_data"))) {
      const found = lookups.sens.get(norm(item)) ?? lookups.sens.get(norm(enumKey(item)));
      if (found) sensitiveData.push(found);
      else errors.push({ field: "sensitive_data", code: "unknown", value: item });
    }

    const outputRecipient = parseEnum("output_recipient", lookups.recipient, true);
    const noteText = get("output_recipient_note");
    const candidate = {
      name,
      description,
      purpose,
      outputRecipient,
      outputRecipientNote: noteText === "" || blocked.has("output_recipient_note") ? null : noteText,
      primaryCategoryId,
      tags: blocked.has("tags") ? [] : splitList(get("tags")),
      frequency: parseEnum("frequency", lookups.freq, true),
      occurrenceCount: parseNumber("occurrence_count", true),
      avgDurationMinutes: parseNumber("avg_duration_minutes", true),
      volume: parseNumber("volume", false),
      volumeUnitId,
      systemIds,
      automationLevel: parseEnum("automation_level", lookups.auto, true),
      ruleBasedDegree: parseEnum("rule_based_degree", lookups.degree, true),
      judgementDegree: parseEnum("judgement_degree", lookups.degree, true),
      exceptionFrequency: parseEnum("exception_frequency", lookups.exc, true),
      dataManuallyCopied: parseBool("data_manually_copied", true),
      needsInfoFromOthers: parseBool("needs_info_from_others", true),
      waiting: parseEnum("waiting", lookups.occ, true),
      rework: parseEnum("rework", lookups.occ, true),
      seasonality: parseEnum("seasonality", lookups.season, true),
      sensitiveData,
      improvementOpportunity: parseBool("improvement_opportunity", false),
      employeeSuggestion: get("employee_suggestion") === "" || blocked.has("employee_suggestion") ? null : get("employee_suggestion"),
    };

    // Run the shared schema for ranges and cross-field rules, but only report what the
    // parsing above has not already flagged.
    let input: ActivityInput | null = null;
    const parsed = activityInputSchema.safeParse(candidate);
    if (parsed.success) {
      input = parsed.data;
    } else {
      const flagged = new Set(errors.map((e) => e.field));
      for (const issue of parsed.error.issues) {
        const field = FIELD_TO_COLUMN[String(issue.path[0])] ?? String(issue.path[0]);
        if (!flagged.has(field)) {
          errors.push({ field, code: "invalid", value: get(field) || undefined });
          flagged.add(field);
        }
      }
    }

    // Warnings never exclude a row, they ask for the participant's review.
    if (input) for (const code of activityWarnings(input)) warnings.push({ field: code === "durationHigh" ? "avg_duration_minutes" : "occurrence_count", code });
    if (name) {
      const ref: ActivityRef = { name, primaryCategoryId, description };
      for (const code of duplicateSignals(ref, refs.existing, earlierInFile)) warnings.push({ field: "name", code, value: name });
      earlierInFile.push(ref);
    }

    const status: RowStatus = errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "READY";
    rows.push({
      rowNumber,
      status,
      input: status === "ERROR" ? null : input,
      errors,
      warnings,
      preview: {
        name,
        category: categoryLabel,
        frequency: candidate.frequency ?? "",
        occurrenceCount: get("occurrence_count"),
        avgDurationMinutes: get("avg_duration_minutes"),
        volume: get("volume"),
        unit: unitLabel,
        systems: systemLabels,
      },
    });
  });

  return rows;
}

/**
 * Warnings for activities about to be written, recomputed on the server at confirmation
 * so the "I reviewed the warnings" step cannot be skipped by editing the request.
 */
export function confirmationWarnings(inputs: ActivityInput[], existing: ActivityRef[], descriptions: boolean = true) {
  const earlier: ActivityRef[] = [];
  let count = 0;
  for (const input of inputs) {
    const ref: ActivityRef = { name: input.name, primaryCategoryId: input.primaryCategoryId, description: descriptions ? input.description : "" };
    count += activityWarnings(input).length + duplicateSignals(ref, existing, earlier).length;
    earlier.push(ref);
  }
  return count;
}
