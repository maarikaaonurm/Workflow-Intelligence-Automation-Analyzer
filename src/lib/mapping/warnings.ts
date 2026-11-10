import type { ActivityInput } from "./schema";

export type WarningCode = "durationHigh" | "occurrenceHigh";

/** Largest occurrence count per frequency period that is plausible for one person. */
const MAX_PLAUSIBLE_OCCURRENCES: Record<ActivityInput["frequency"], number> = {
  DAILY: 50,
  WEEKLY: 250,
  MONTHLY: 1000,
  QUARTERLY: 1000,
  YEARLY: 1000,
  AD_HOC: 500,
};

/** More than this per occurrence is possible (a long close task) but worth a second look. */
export const HIGH_DURATION_MINUTES = 480;

/**
 * Plausibility warnings for values that are valid but unusual. They never block a save;
 * the participant sees them in the preview and in the completion review and may confirm.
 */
export function activityWarnings(input: Pick<ActivityInput, "frequency" | "occurrenceCount" | "avgDurationMinutes">): WarningCode[] {
  const warnings: WarningCode[] = [];
  if (input.avgDurationMinutes > HIGH_DURATION_MINUTES) warnings.push("durationHigh");
  if (input.occurrenceCount > MAX_PLAUSIBLE_OCCURRENCES[input.frequency]) warnings.push("occurrenceHigh");
  return warnings;
}

export interface ActivityRef {
  name: string;
  primaryCategoryId: string | undefined;
  description: string;
}

export type DuplicateCode = "duplicateExisting" | "duplicateInFile" | "duplicateSimilar";

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Explainable duplicate signals, never a merge: the same normalized name, or the same category
 * with the same normalized description. `existing` are the participant's current activities and
 * `earlierInFile` are rows that appear earlier in the same file.
 */
export function duplicateSignals(candidate: ActivityRef, existing: ActivityRef[], earlierInFile: ActivityRef[]): DuplicateCode[] {
  const name = norm(candidate.name);
  const description = norm(candidate.description);
  const sameName = (o: ActivityRef) => name !== "" && norm(o.name) === name;
  const sameCategoryAndDescription = (o: ActivityRef) =>
    description !== "" &&
    candidate.primaryCategoryId !== undefined &&
    o.primaryCategoryId === candidate.primaryCategoryId &&
    norm(o.description) === description;

  if (existing.some(sameName)) return ["duplicateExisting"];
  if (earlierInFile.some(sameName)) return ["duplicateInFile"];
  if (existing.some(sameCategoryAndDescription) || earlierInFile.some(sameCategoryAndDescription)) return ["duplicateSimilar"];
  return [];
}
