import { activityInputSchema, type ActivityInput } from "./schema";
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

/** Template columns, in order. `enumValues` are the accepted codes (case-insensitive). */
export const IMPORT_COLUMNS = [
  { key: "name", required: true },
  { key: "description", required: true },
  { key: "purpose", required: true },
  { key: "output_recipient", required: true, enumValues: OUTPUT_RECIPIENTS },
  { key: "primary_category", required: true },
  { key: "tags", required: false },
  { key: "frequency", required: true, enumValues: FREQUENCIES },
  { key: "occurrence_count", required: true },
  { key: "avg_duration_minutes", required: true },
  { key: "volume", required: false },
  { key: "volume_unit", required: false },
  { key: "systems", required: false },
  { key: "automation_level", required: true, enumValues: AUTOMATION_LEVELS },
  { key: "rule_based_degree", required: true, enumValues: DEGREES },
  { key: "judgement_degree", required: true, enumValues: DEGREES },
  { key: "exception_frequency", required: true, enumValues: EXCEPTION_FREQUENCIES },
  { key: "data_manually_copied", required: true, yesNo: true },
  { key: "needs_info_from_others", required: true, yesNo: true },
  { key: "waiting", required: true, enumValues: OCCURRENCE_LEVELS },
  { key: "rework", required: true, enumValues: OCCURRENCE_LEVELS },
  { key: "seasonality", required: true, enumValues: SEASONALITIES },
  { key: "sensitive_data", required: true, enumValues: SENSITIVE_CATEGORIES },
  { key: "improvement_opportunity", required: false, yesNo: true },
  { key: "employee_suggestion", required: false },
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export interface ImportReferences {
  categories: { id: string; nameEn: string; nameEt: string }[];
  units: { id: string; key: string; nameEn: string; nameEt: string }[];
  systems: { id: string; name: string }[];
  /** Names of activities the participant already has (for duplicate warnings). */
  existingNames: string[];
}

export type IssueCode = "required" | "invalid" | "unknown" | "duplicateExisting" | "duplicateInFile";
export interface ImportIssue {
  field: string;
  code: IssueCode;
  value?: string;
}

export interface ImportRow {
  rowNumber: number;
  /** Present only when the row has no errors. */
  input: ActivityInput | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

const norm = (v: string) => v.trim().toLowerCase();
const enumKey = (v: string) => v.trim().toUpperCase().replace(/[\s-]+/g, "_");

function parseYesNo(v: string): boolean | null {
  const x = norm(v);
  if (["yes", "y", "true", "1", "jah"].includes(x)) return true;
  if (["no", "n", "false", "0", "ei"].includes(x)) return false;
  return null;
}

function splitList(v: string): string[] {
  return v
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lower-cases a header and joins words with underscores: "Avg Duration Minutes" -> avg_duration_minutes. */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Maps a schema field name (as reported by Zod) back to its template column. */
const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name",
  description: "description",
  purpose: "purpose",
  outputRecipient: "output_recipient",
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
 * Validates imported records against the same schema as the manual form. `records`
 * are keyed by normalized header; row numbers are spreadsheet rows (header = 1).
 * Fully empty rows are skipped. Duplicate names only warn.
 */
export function parseImportRecords(records: Record<string, string>[], refs: ImportReferences): ImportRow[] {
  const existing = new Set(refs.existingNames.map(norm));
  const seenInFile = new Set<string>();
  const rows: ImportRow[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    if (Object.values(record).every((v) => v.trim() === "")) return;

    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const get = (key: string) => (record[key] ?? "").trim();

    const requireValue = (key: string): string => {
      const v = get(key);
      if (v === "") errors.push({ field: key, code: "required" });
      return v;
    };
    const parseEnum = <T extends string>(key: string, allowed: readonly T[], required: boolean): T | undefined => {
      const v = required ? requireValue(key) : get(key);
      if (v === "") return undefined;
      const found = allowed.find((a) => a === enumKey(v));
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
    const categoryName = requireValue("primary_category");
    if (categoryName) {
      const match = refs.categories.find((c) => norm(c.nameEn) === norm(categoryName) || norm(c.nameEt) === norm(categoryName));
      if (match) primaryCategoryId = match.id;
      else errors.push({ field: "primary_category", code: "unknown", value: categoryName });
    }

    let volumeUnitId: string | null = null;
    const unitName = get("volume_unit");
    if (unitName) {
      const match = refs.units.find((u) => [u.key, u.nameEn, u.nameEt].some((x) => norm(x) === norm(unitName)));
      if (match) volumeUnitId = match.id;
      else errors.push({ field: "volume_unit", code: "unknown", value: unitName });
    }

    const systemIds: string[] = [];
    for (const systemName of splitList(get("systems"))) {
      const match = refs.systems.find((s) => norm(s.name) === norm(systemName));
      if (match) systemIds.push(match.id);
      else errors.push({ field: "systems", code: "unknown", value: systemName });
    }

    const sensitiveRaw = splitList(requireValue("sensitive_data"));
    const sensitiveData: (typeof SENSITIVE_CATEGORIES)[number][] = [];
    for (const item of sensitiveRaw) {
      const found = SENSITIVE_CATEGORIES.find((c) => c === enumKey(item));
      if (found) sensitiveData.push(found);
      else errors.push({ field: "sensitive_data", code: "unknown", value: item });
    }

    const candidate = {
      name,
      description,
      purpose,
      outputRecipient: parseEnum("output_recipient", OUTPUT_RECIPIENTS, true),
      primaryCategoryId,
      tags: splitList(get("tags")),
      frequency: parseEnum("frequency", FREQUENCIES, true),
      occurrenceCount: parseNumber("occurrence_count", true),
      avgDurationMinutes: parseNumber("avg_duration_minutes", true),
      volume: parseNumber("volume", false),
      volumeUnitId,
      systemIds,
      automationLevel: parseEnum("automation_level", AUTOMATION_LEVELS, true),
      ruleBasedDegree: parseEnum("rule_based_degree", DEGREES, true),
      judgementDegree: parseEnum("judgement_degree", DEGREES, true),
      exceptionFrequency: parseEnum("exception_frequency", EXCEPTION_FREQUENCIES, true),
      dataManuallyCopied: parseBool("data_manually_copied", true),
      needsInfoFromOthers: parseBool("needs_info_from_others", true),
      waiting: parseEnum("waiting", OCCURRENCE_LEVELS, true),
      rework: parseEnum("rework", OCCURRENCE_LEVELS, true),
      seasonality: parseEnum("seasonality", SEASONALITIES, true),
      sensitiveData,
      improvementOpportunity: parseBool("improvement_opportunity", false),
      employeeSuggestion: get("employee_suggestion") === "" ? null : get("employee_suggestion"),
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

    if (name) {
      const key = norm(name);
      if (existing.has(key)) warnings.push({ field: "name", code: "duplicateExisting", value: name });
      else if (seenInFile.has(key)) warnings.push({ field: "name", code: "duplicateInFile", value: name });
      seenInFile.add(key);
    }

    rows.push({ rowNumber, input: errors.length === 0 ? input : null, errors, warnings });
  });

  return rows;
}
