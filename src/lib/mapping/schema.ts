import { z } from "zod";
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

/** Validated content of one Initial Activity (one version). */
export const activityInputSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(1000),
    purpose: z.string().trim().min(1).max(500),
    outputRecipient: z.enum(OUTPUT_RECIPIENTS),
    primaryCategoryId: z.string().min(1),
    tags: z.array(z.string().trim().min(1).max(40)).max(10),
    frequency: z.enum(FREQUENCIES),
    // Occurrences per frequency period (for AD_HOC: per month).
    occurrenceCount: z.number().int().min(1).max(1000),
    avgDurationMinutes: z.number().int().min(1).max(1440),
    volume: z.number().positive().max(1_000_000_000).nullable(),
    volumeUnitId: z.string().min(1).nullable(),
    systemIds: z.array(z.string().min(1)).max(20),
    automationLevel: z.enum(AUTOMATION_LEVELS),
    ruleBasedDegree: z.enum(DEGREES),
    judgementDegree: z.enum(DEGREES),
    exceptionFrequency: z.enum(EXCEPTION_FREQUENCIES),
    dataManuallyCopied: z.boolean(),
    needsInfoFromOthers: z.boolean(),
    waiting: z.enum(OCCURRENCE_LEVELS),
    rework: z.enum(OCCURRENCE_LEVELS),
    seasonality: z.enum(SEASONALITIES),
    sensitiveData: z.array(z.enum(SENSITIVE_CATEGORIES)).min(1),
    improvementOpportunity: z.boolean(),
    employeeSuggestion: z.string().trim().max(1000).nullable(),
  })
  .superRefine((value, ctx) => {
    // Volume and unit go together; per-unit metrics are never computed from half a pair.
    if ((value.volume === null) !== (value.volumeUnitId === null)) {
      ctx.addIssue({ code: "custom", path: ["volume"], message: "volume and unit must be given together" });
    }
    // "No Sensitive Data" excludes every other category.
    if (value.sensitiveData.includes("NONE") && value.sensitiveData.length > 1) {
      ctx.addIssue({ code: "custom", path: ["sensitiveData"], message: "NONE excludes other categories" });
    }
  });

export type ActivityInput = z.infer<typeof activityInputSchema>;
