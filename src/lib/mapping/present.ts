import type { Locale } from "@/lib/i18n/messages";

export type FormValues = Record<string, string | string[]>;

interface VersionLike {
  name: string;
  description: string;
  purpose: string;
  outputRecipient: string;
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
    primaryCategoryId: v.primaryCategoryId,
    tags: v.tags.join("; "),
    frequency: v.frequency,
    occurrenceCount: String(v.occurrenceCount),
    avgDurationMinutes: String(v.avgDurationMinutes),
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
