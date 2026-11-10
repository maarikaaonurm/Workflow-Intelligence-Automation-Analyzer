import { describe, expect, it } from "vitest";
import { activityInputSchema, type ActivityInput } from "./schema";
import { durationMinutes, parseActivityForm } from "./form";
import { parseImportRecords, summarizeImport } from "./import";
import { recordEn, recordEt, refs } from "./test-fixtures";
import { activityWarnings, duplicateSignals } from "./warnings";
import { baselineHash, contentHash } from "./baseline";
import { changedFields, localizeCategory, mappingStatus, versionToValues } from "./present";
import { messages } from "@/lib/i18n/messages";

const parseOne = (record: Record<string, string>, locale: "en" | "et" = "en") => parseImportRecords([record], refs, locale)[0];
const base = (): ActivityInput => parseOne(recordEn()).input!;

describe("activity input schema", () => {
  it("accepts a valid activity", () => {
    expect(activityInputSchema.safeParse(base()).success).toBe(true);
  });

  it("makes No Sensitive Data mutually exclusive", () => {
    expect(activityInputSchema.safeParse({ ...base(), sensitiveData: ["NONE", "PERSONAL"] }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), sensitiveData: ["NONE"] }).success).toBe(true);
    expect(activityInputSchema.safeParse({ ...base(), sensitiveData: ["PERSONAL", "FINANCIAL"] }).success).toBe(true);
  });

  it("requires volume and unit together", () => {
    expect(activityInputSchema.safeParse({ ...base(), volume: 10, volumeUnitId: null }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), volume: null, volumeUnitId: "unit1" }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), volume: null, volumeUnitId: null }).success).toBe(true);
  });

  it("requires a positive occurrence count and a positive, bounded duration", () => {
    expect(activityInputSchema.safeParse({ ...base(), occurrenceCount: 0 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), occurrenceCount: -2 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), avgDurationMinutes: 0 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), avgDurationMinutes: 1441 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base(), avgDurationMinutes: 12.5 }).success).toBe(false);
  });

  it("allows a recipient clarification only for Other", () => {
    expect(activityInputSchema.safeParse({ ...base(), outputRecipient: "OTHER", outputRecipientNote: "A regulator" }).success).toBe(true);
    expect(activityInputSchema.safeParse({ ...base(), outputRecipient: "MANAGER", outputRecipientNote: "x" }).success).toBe(false);
  });

  it("stores canonical values, never display labels", () => {
    expect(base()).toMatchObject({ frequency: "MONTHLY", outputRecipient: "MANAGER", seasonality: "END_OF_MONTH", automationLevel: "PARTIAL" });
  });
});

describe("activity form parsing", () => {
  const form = () => {
    const f = new FormData();
    const fields: Record<string, string> = {
      name: "Bank receipt review",
      description: "Review receipts",
      purpose: "Match payments",
      outputRecipient: "MANAGER",
      primaryCategoryId: "cat1",
      tags: "bank, daily",
      frequency: "DAILY",
      occurrenceCount: "1",
      durationValue: "30",
      durationUnit: "minutes",
      volume: "",
      volumeUnitId: "",
      automationLevel: "MANUAL",
      ruleBasedDegree: "HIGH",
      judgementDegree: "LOW",
      exceptionFrequency: "RARE",
      dataManuallyCopied: "no",
      needsInfoFromOthers: "no",
      waiting: "NONE",
      rework: "NONE",
      seasonality: "EVEN",
    };
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    f.append("sensitiveData", "NONE");
    return f;
  };

  it("parses a complete form", () => {
    const result = parseActivityForm(form());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.tags).toEqual(["bank", "daily"]);
      expect(result.input.volume).toBeNull();
      expect(result.input.avgDurationMinutes).toBe(30);
      expect(result.input.outputRecipientNote).toBeNull();
    }
  });

  it("stores hours as canonical minutes", () => {
    const f = form();
    f.set("durationValue", "1.5");
    f.set("durationUnit", "hours");
    expect(durationMinutes(f)).toBe(90);
    const result = parseActivityForm(f);
    expect(result.ok && result.input.avgDurationMinutes).toBe(90);
  });

  it("still accepts the older minutes-only field", () => {
    const f = form();
    f.delete("durationValue");
    f.delete("durationUnit");
    f.set("avgDurationMinutes", "45");
    const result = parseActivityForm(f);
    expect(result.ok && result.input.avgDurationMinutes).toBe(45);
  });

  it("keeps a recipient clarification only for Other", () => {
    const f = form();
    f.set("outputRecipientNote", "A regulator");
    expect(parseActivityForm(f).ok && (parseActivityForm(f) as { ok: true; input: ActivityInput }).input.outputRecipientNote).toBeNull();
    f.set("outputRecipient", "OTHER");
    const result = parseActivityForm(f);
    expect(result.ok && result.input.outputRecipientNote).toBe("A regulator");
  });

  it("names the invalid fields: required, positive count and duration", () => {
    const f = form();
    f.set("durationValue", "0");
    f.set("occurrenceCount", "0");
    f.set("name", "");
    f.set("primaryCategoryId", "");
    const result = parseActivityForm(f);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields.sort()).toEqual(["avgDurationMinutes", "name", "occurrenceCount", "primaryCategoryId"]);
  });

  it("rejects No Sensitive Data combined with another category", () => {
    const f = form();
    f.append("sensitiveData", "PERSONAL");
    const result = parseActivityForm(f);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields).toContain("sensitiveData");
  });

  it("round-trips a stored version into form values and back", () => {
    const asVersion = (minutes: number) =>
      ({ ...base(), avgDurationMinutes: minutes, systems: [{ id: "sys1" }] }) as unknown as Parameters<typeof versionToValues>[0];
    // Whole hours are shown as hours, everything else in minutes; the stored value is always minutes.
    expect(versionToValues(asVersion(120))).toMatchObject({ durationValue: "2", durationUnit: "hours", frequency: "MONTHLY", dataManuallyCopied: "yes" });
    expect(versionToValues(asVersion(90))).toMatchObject({ durationValue: "90", durationUnit: "minutes" });
  });
});

describe("import parsing: localized values normalize to canonical values", () => {
  it("reads English labels", () => {
    const row = parseOne(recordEn());
    expect(row.status).toBe("READY");
    expect(row.input).toMatchObject({
      primaryCategoryId: "cat1",
      volumeUnitId: "unit1",
      systemIds: ["sys1", "sys2"],
      frequency: "MONTHLY",
      seasonality: "END_OF_MONTH",
      dataManuallyCopied: true,
      sensitiveData: ["FINANCIAL"],
    });
  });

  it("reads Estonian labels to exactly the same canonical activity", () => {
    expect(parseOne(recordEt(), "et").input).toEqual(parseOne(recordEn()).input);
  });

  it("accepts canonical codes and mixed spellings too", () => {
    const row = parseOne({ ...recordEn(), frequency: "MONTHLY", seasonality: "end_of_month", sensitive_data: "financial", automation_level: "partial" });
    expect(row.input).toMatchObject({ frequency: "MONTHLY", seasonality: "END_OF_MONTH", sensitiveData: ["FINANCIAL"], automationLevel: "PARTIAL" });
  });

  it("shows the preview in the interface language and changes no canonical value", () => {
    expect(parseOne(recordEn(), "et").preview.category).toBe("Täpsustamine ja kontroll");
    expect(parseOne(recordEn(), "en").preview.category).toBe("Reconciliation & checks");
    expect(parseOne(recordEn(), "et").input).toEqual(parseOne(recordEn(), "en").input);
  });

  it("the Estonian label for Daily is Igapäevane and it maps to DAILY", () => {
    expect(messages.et.freqDAILY).toBe("Igapäevane");
    expect(parseOne({ ...recordEt(), frequency: "Igapäevane" }, "et").input?.frequency).toBe("DAILY");
    expect(parseOne({ ...recordEn(), frequency: "Daily" }).input?.frequency).toBe("DAILY");
  });
});

describe("import validation", () => {
  it("reports unknown values and malformed numbers per row and excludes the row", () => {
    const row = parseOne({ ...recordEn(), primary_category: "Accounting task", frequency: "sometimes", avg_duration_minutes: "abc" });
    expect(row.status).toBe("ERROR");
    expect(row.input).toBeNull();
    expect(row.errors).toEqual(
      expect.arrayContaining([
        { field: "primary_category", code: "unknown", value: "Accounting task" },
        { field: "frequency", code: "unknown", value: "sometimes" },
        { field: "avg_duration_minutes", code: "invalid", value: "abc" },
      ]),
    );
  });

  it("flags missing required fields", () => {
    expect(parseOne({ ...recordEn(), purpose: "" }).errors).toContainEqual({ field: "purpose", code: "required" });
    expect(parseOne({ ...recordEn(), name: "" }).errors).toContainEqual({ field: "name", code: "required" });
  });

  it("rejects a non-positive occurrence count and an invalid duration", () => {
    expect(parseOne({ ...recordEn(), occurrence_count: "0" }).errors.map((e) => e.field)).toContain("occurrence_count");
    expect(parseOne({ ...recordEn(), avg_duration_minutes: "-5" }).errors.map((e) => e.field)).toContain("avg_duration_minutes");
    expect(parseOne({ ...recordEn(), avg_duration_minutes: "0" }).errors.map((e) => e.field)).toContain("avg_duration_minutes");
  });

  it("rejects No Sensitive Data combined with another category, and volume without a unit", () => {
    const sensitive = parseOne({ ...recordEn(), sensitive_data: "No Sensitive Data; Financial Data" });
    expect(sensitive.status).toBe("ERROR");
    expect(sensitive.errors.map((e) => e.field)).toContain("sensitive_data");
    expect(parseOne({ ...recordEn(), volume_unit: "" }).errors.map((e) => e.field)).toContain("volume");
  });

  it("refuses text that starts like a spreadsheet formula", () => {
    for (const bad of ["=1+1", "+cmd", "@SUM(A1)"]) {
      const row = parseOne({ ...recordEn(), name: bad });
      expect(row.status).toBe("ERROR");
      expect(row.errors).toContainEqual({ field: "name", code: "formula" });
    }
    expect(parseOne({ ...recordEn(), employee_suggestion: "=HYPERLINK(1)" }).errors).toContainEqual({ field: "employee_suggestion", code: "formula" });
  });

  it("distinguishes Ready, Warning and Error and summarizes them", () => {
    const rows = parseImportRecords(
      [recordEn(), { ...recordEn(), name: "Bank receipt review" }, { ...recordEn(), name: "Another", frequency: "nope" }],
      refs,
    );
    expect(rows.map((r) => r.status)).toEqual(["READY", "WARNING", "ERROR"]);
    expect(summarizeImport(rows)).toEqual({ ready: 1, warning: 1, error: 1 });
  });

  it("skips fully empty rows but keeps spreadsheet row numbers", () => {
    const empty = Object.fromEntries(Object.keys(recordEn()).map((k) => [k, ""]));
    const rows = parseImportRecords([empty, recordEn()], refs);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(3);
  });
});

describe("duplicate and plausibility warnings", () => {
  it("warns about a duplicate of an existing activity, within the file and by category plus description, without merging", () => {
    const rows = parseImportRecords(
      [
        { ...recordEn(), name: "Bank receipt review" },
        { ...recordEn(), name: "Other task", description: "Something unique" },
        { ...recordEn(), name: "other   TASK", description: "Different words" },
        { ...recordEn(), name: "Third", description: "Review receipts" },
      ],
      refs,
    );
    expect(rows[0].warnings.map((w) => w.code)).toEqual(["duplicateExisting"]);
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings.map((w) => w.code)).toEqual(["duplicateInFile"]);
    expect(rows[3].warnings.map((w) => w.code)).toEqual(["duplicateSimilar"]);
    // Warnings never exclude a row: every row can still be imported after review.
    expect(rows.every((r) => r.input !== null)).toBe(true);
  });

  it("uses explainable signals only", () => {
    const candidate = { name: "Daily Check", primaryCategoryId: "c", description: "d" };
    expect(duplicateSignals(candidate, [{ name: "daily check", primaryCategoryId: "x", description: "z" }], [])).toEqual(["duplicateExisting"]);
    expect(duplicateSignals(candidate, [], [{ name: "unrelated", primaryCategoryId: "c", description: "D" }])).toEqual(["duplicateSimilar"]);
    expect(duplicateSignals(candidate, [{ name: "unrelated", primaryCategoryId: "other", description: "d" }], [])).toEqual([]);
  });

  it("warns, but does not block, for unusually high but possible values", () => {
    expect(activityWarnings({ frequency: "DAILY", occurrenceCount: 1, avgDurationMinutes: 600 })).toEqual(["durationHigh"]);
    expect(activityWarnings({ frequency: "DAILY", occurrenceCount: 80, avgDurationMinutes: 10 })).toEqual(["occurrenceHigh"]);
    expect(activityWarnings({ frequency: "MONTHLY", occurrenceCount: 4, avgDurationMinutes: 60 })).toEqual([]);
    const row = parseOne({ ...recordEn(), avg_duration_minutes: "900" });
    expect(row.status).toBe("WARNING");
    expect(row.input).not.toBeNull();
  });
});

describe("baseline identity and versions", () => {
  const item = (id: string, name: string) => ({ activityId: id, content: { ...base(), name } });

  it("is stable for the same content regardless of order, and changes when the content changes", () => {
    const a = baselineHash([item("a1", "One"), item("a2", "Two")]);
    expect(baselineHash([item("a2", "Two"), item("a1", "One")])).toBe(a);
    expect(baselineHash([item("a1", "One"), item("a2", "Changed")])).not.toBe(a);
    expect(contentHash({ x: 1, y: 2 })).toBe(contentHash({ y: 2, x: 1 }));
  });

  it("names the fields that differ between the baseline and a refinement, never their values", () => {
    expect(changedFields(base(), { ...base(), avgDurationMinutes: 120, frequency: "WEEKLY" }).sort()).toEqual(["avgDurationMinutes", "frequency"]);
    expect(changedFields(base(), { ...base(), systemIds: ["sys2", "sys1"] })).toEqual([]);
  });

  it("derives the canonical mapping status", () => {
    expect(mappingStatus({ activityCount: 0, completedAt: null })).toBe("NOT_STARTED");
    expect(mappingStatus({ activityCount: 2, completedAt: null })).toBe("DRAFT");
    expect(mappingStatus({ activityCount: 2, completedAt: new Date() })).toBe("COMPLETED");
  });
});

describe("category localization", () => {
  const category = {
    nameEn: "Reporting",
    nameEt: "Aruandlus",
    definition: "English definition",
    belongsHere: "English belongs",
    notBelongsHere: "English not",
    boundaryExamples: "English boundary",
    definitionEt: "Eesti definitsioon",
    belongsHereEt: "Eesti siia",
    notBelongsHereEt: "Eesti mitte",
    boundaryExamplesEt: "Eesti piir",
  };

  it("shows the whole card in one language", () => {
    expect(localizeCategory(category, "et")).toEqual({
      name: "Aruandlus",
      definition: "Eesti definitsioon",
      belongsHere: "Eesti siia",
      notBelongsHere: "Eesti mitte",
      boundaryExamples: "Eesti piir",
    });
    expect(localizeCategory(category, "en")).toMatchObject({ name: "Reporting", definition: "English definition", boundaryExamples: "English boundary" });
  });

  it("falls back to English for a missing Estonian text, per field", () => {
    const partial = { ...category, definitionEt: null, boundaryExamplesEt: null };
    expect(localizeCategory(partial, "et")).toMatchObject({ definition: "English definition", belongsHere: "Eesti siia", boundaryExamples: "English boundary" });
  });
});
