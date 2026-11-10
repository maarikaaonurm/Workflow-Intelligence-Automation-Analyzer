import type { Locale } from "@/lib/i18n/messages";
import type { ActivityInput } from "./schema";

export type FormValues = Record<string, string | string[]>;

interface VersionLike {
  name: string;
  description: string;
  purpose: string;
  outputRecipient: string;
  outputRecipientNote: string | null;
  primaryCategoryId: string;
  tags: string[];
  frequency: string;
  occurrenceCount: number;
  avgDurationMinutes: number;
  volume: number | null;
  volumeUnitId: string | null;
  systems: { id: string }[];
  automationLevel: string;
  ruleBasedDegree: string;
  judgementDegree: string;
  exceptionFrequency: string;
  dataManuallyCopied: boolean;
  needsInfoFromOthers: boolean;
  waiting: string;
  rework: string;
  seasonality: string;
  sensitiveData: string[];
  improvementOpportunity: boolean;
  employeeSuggestion: string | null;
}

/** Form defaults for editing an existing activity version. */
export function versionToValues(v: VersionLike): FormValues {
  return {
    name: v.name,
    description: v.description,
    purpose: v.purpose,
    outputRecipient: v.outputRecipient,
    outputRecipientNote: v.outputRecipientNote ?? "",
    primaryCategoryId: v.primaryCategoryId,
    tags: v.tags.join("; "),
    frequency: v.frequency,
    occurrenceCount: String(v.occurrenceCount),
    avgDurationMinutes: String(v.avgDurationMinutes),
    ...durationFormValues(v.avgDurationMinutes),
    volume: v.volume === null ? "" : String(v.volume),
    volumeUnitId: v.volumeUnitId ?? "",
    systemIds: v.systems.map((s) => s.id),
    automationLevel: v.automationLevel,
    ruleBasedDegree: v.ruleBasedDegree,
    judgementDegree: v.judgementDegree,
    exceptionFrequency: v.exceptionFrequency,
    dataManuallyCopied: v.dataManuallyCopied ? "yes" : "no",
    needsInfoFromOthers: v.needsInfoFromOthers ? "yes" : "no",
    waiting: v.waiting,
    rework: v.rework,
    seasonality: v.seasonality,
    sensitiveData: v.sensitiveData,
    improvementOpportunity: v.improvementOpportunity ? "on" : "",
    employeeSuggestion: v.employeeSuggestion ?? "",
  };
}

export function localized(item: { nameEn: string; nameEt: string }, locale: Locale): string {
  return locale === "et" ? item.nameEt : item.nameEn;
}

/** Shows whole hours as hours, everything else in minutes. */
export function durationFormValues(minutes: number): { durationValue: string; durationUnit: string } {
  return minutes >= 60 && minutes % 60 === 0
    ? { durationValue: String(minutes / 60), durationUnit: "hours" }
    : { durationValue: String(minutes), durationUnit: "minutes" };
}

export interface CategoryLike {
  nameEn: string;
  nameEt: string;
  definition: string;
  belongsHere: string;
  notBelongsHere: string;
  boundaryExamples: string | null;
  definitionEt: string | null;
  belongsHereEt: string | null;
  notBelongsHereEt: string | null;
  boundaryExamplesEt: string | null;
}

/**
 * The whole category experience in one language. One canonical category carries both
 * languages; a missing Estonian text falls back to the English text so a card never
 * shows an empty field (the Estonian name is always required).
 */
export function localizeCategory(c: CategoryLike, locale: Locale) {
  const et = locale === "et";
  return {
    name: et ? c.nameEt : c.nameEn,
    definition: (et ? c.definitionEt : null) ?? c.definition,
    belongsHere: (et ? c.belongsHereEt : null) ?? c.belongsHere,
    notBelongsHere: (et ? c.notBelongsHereEt : null) ?? c.notBelongsHere,
    boundaryExamples: (et ? c.boundaryExamplesEt : null) ?? c.boundaryExamples,
  };
}

export type MappingStatus = "NOT_STARTED" | "DRAFT" | "COMPLETED";

/** Canonical mapping status of one participant. */
export function mappingStatus(args: { activityCount: number; completedAt: Date | null }): MappingStatus {
  if (args.completedAt) return "COMPLETED";
  return args.activityCount > 0 ? "DRAFT" : "NOT_STARTED";
}

/** The validated input a stored version represents (the inverse of saving). */
export function versionToInput(v: VersionLike): ActivityInput {
  return {
    name: v.name,
    description: v.description,
    purpose: v.purpose,
    outputRecipient: v.outputRecipient as ActivityInput["outputRecipient"],
    outputRecipientNote: v.outputRecipientNote,
    primaryCategoryId: v.primaryCategoryId,
    tags: v.tags,
    frequency: v.frequency as ActivityInput["frequency"],
    occurrenceCount: v.occurrenceCount,
    avgDurationMinutes: v.avgDurationMinutes,
    volume: v.volume,
    volumeUnitId: v.volumeUnitId,
    systemIds: v.systems.map((x) => x.id).sort(),
    automationLevel: v.automationLevel as ActivityInput["automationLevel"],
    ruleBasedDegree: v.ruleBasedDegree as ActivityInput["ruleBasedDegree"],
    judgementDegree: v.judgementDegree as ActivityInput["judgementDegree"],
    exceptionFrequency: v.exceptionFrequency as ActivityInput["exceptionFrequency"],
    dataManuallyCopied: v.dataManuallyCopied,
    needsInfoFromOthers: v.needsInfoFromOthers,
    waiting: v.waiting as ActivityInput["waiting"],
    rework: v.rework as ActivityInput["rework"],
    seasonality: v.seasonality as ActivityInput["seasonality"],
    sensitiveData: v.sensitiveData as ActivityInput["sensitiveData"],
    improvementOpportunity: v.improvementOpportunity,
    employeeSuggestion: v.employeeSuggestion,
  };
}

/** Names of the fields that differ between two versions (never their values, so it is safe to audit). */
export function changedFields(before: ActivityInput, after: ActivityInput): string[] {
  const normalize = (i: ActivityInput) => ({ ...i, systemIds: [...i.systemIds].sort(), sensitiveData: [...i.sensitiveData].sort() });
  const a = normalize(before) as Record<string, unknown>;
  const b = normalize(after) as Record<string, unknown>;
  return Object.keys(b).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

/** Category choices for the activity form, with the localized guide text next to each one. */
export function toCategoryOptions(categories: (CategoryLike & { id: string })[], locale: Locale) {
  return categories.map((c) => ({ id: c.id, label: localizeCategory(c, locale).name, ...localizeCategory(c, locale) }));
}
