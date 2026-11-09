import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { activityInputSchema } from "./schema";
import { parseActivityForm } from "./form";
import { parseImportRecords, type ImportReferences } from "./import";
import { buildTemplateCsv, buildTemplateXlsx, readImportFile } from "./files";

const refs: ImportReferences = {
  categories: [{ id: "cat1", nameEn: "Reconciliation & checks", nameEt: "Täpsustamine ja kontroll" }],
  units: [{ id: "unit1", key: "invoices", nameEn: "Invoices", nameEt: "Arved" }],
  systems: [
    { id: "sys1", name: "ERP" },
    { id: "sys2", name: "Excel" },
  ],
  existingNames: ["Bank receipt review"],
};

const validRecord = (): Record<string, string> => ({
  name: "Month-end accrual check",
  description: "Check accruals against the ledger",
  purpose: "Correct month-end figures",
  output_recipient: "manager",
  primary_category: "reconciliation & checks",
  tags: "month-end; control",
  frequency: "monthly",
  occurrence_count: "1",
  avg_duration_minutes: "90",
  volume: "45",
  volume_unit: "Invoices",
  systems: "ERP; Excel",
  automation_level: "partial",
  rule_based_degree: "high",
  judgement_degree: "low",
  exception_frequency: "occasional",
  data_manually_copied: "yes",
  needs_info_from_others: "no",
  waiting: "none",
  rework: "sometimes",
  seasonality: "end of month",
  sensitive_data: "financial",
  improvement_opportunity: "yes",
  employee_suggestion: "Pull the data automatically",
});

describe("activityInputSchema", () => {
  const base = parseImportRecords([validRecord()], refs)[0].input!;

  it("accepts a valid activity", () => {
    expect(activityInputSchema.safeParse(base).success).toBe(true);
  });

  it("makes No Sensitive Data mutually exclusive", () => {
    expect(activityInputSchema.safeParse({ ...base, sensitiveData: ["NONE", "PERSONAL"] }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base, sensitiveData: ["NONE"] }).success).toBe(true);
    expect(activityInputSchema.safeParse({ ...base, sensitiveData: ["PERSONAL", "FINANCIAL"] }).success).toBe(true);
  });

  it("requires volume and unit together", () => {
    expect(activityInputSchema.safeParse({ ...base, volume: 10, volumeUnitId: null }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base, volume: null, volumeUnitId: "unit1" }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base, volume: null, volumeUnitId: null }).success).toBe(true);
  });

  it("rejects out-of-range durations and counts", () => {
    expect(activityInputSchema.safeParse({ ...base, avgDurationMinutes: 0 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base, avgDurationMinutes: 1441 }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...base, occurrenceCount: 0 }).success).toBe(false);
  });
});

describe("parseActivityForm", () => {
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
      avgDurationMinutes: "30",
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
      expect(result.input.improvementOpportunity).toBe(false);
    }
  });

  it("names the invalid fields", () => {
    const f = form();
    f.set("avgDurationMinutes", "0");
    f.set("name", "");
    const result = parseActivityForm(f);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields.sort()).toEqual(["avgDurationMinutes", "name"]);
  });

  it("rejects No Sensitive Data combined with another category", () => {
    const f = form();
    f.append("sensitiveData", "PERSONAL");
    expect(parseActivityForm(f).ok).toBe(false);
  });
});

describe("parseImportRecords", () => {
  it("accepts a valid row and resolves references and aliases", () => {
    const [row] = parseImportRecords([validRecord()], refs);
    expect(row.errors).toEqual([]);
    expect(row.rowNumber).toBe(2);
    expect(row.input).toMatchObject({
      primaryCategoryId: "cat1",
      volumeUnitId: "unit1",
      systemIds: ["sys1", "sys2"],
      seasonality: "END_OF_MONTH",
      dataManuallyCopied: true,
      tags: ["month-end", "control"],
    });
  });

  it("reports row-level errors without importing the row", () => {
    const [row] = parseImportRecords(
      [{ ...validRecord(), primary_category: "Nonexistent", frequency: "sometimes", avg_duration_minutes: "abc" }],
      refs,
    );
    expect(row.input).toBeNull();
    expect(row.errors).toEqual(
      expect.arrayContaining([
        { field: "primary_category", code: "unknown", value: "Nonexistent" },
        { field: "frequency", code: "unknown", value: "sometimes" },
        { field: "avg_duration_minutes", code: "invalid", value: "abc" },
      ]),
    );
  });

  it("flags missing required fields", () => {
    const [row] = parseImportRecords([{ ...validRecord(), purpose: "" }], refs);
    expect(row.errors).toContainEqual({ field: "purpose", code: "required" });
  });

  it("enforces cross-field rules from the shared schema", () => {
    const sensitive = parseImportRecords([{ ...validRecord(), sensitive_data: "none; personal" }], refs)[0];
    expect(sensitive.input).toBeNull();
    expect(sensitive.errors.map((e) => e.field)).toContain("sensitive_data");

    const orphanVolume = parseImportRecords([{ ...validRecord(), volume_unit: "" }], refs)[0];
    expect(orphanVolume.input).toBeNull();
    expect(orphanVolume.errors.map((e) => e.field)).toContain("volume");
  });

  it("warns about duplicates of existing activities and within the file, but still accepts them", () => {
    const rows = parseImportRecords(
      [
        { ...validRecord(), name: "Bank receipt review" },
        { ...validRecord(), name: "Other task" },
        { ...validRecord(), name: "other task" },
      ],
      refs,
    );
    expect(rows[0].warnings[0].code).toBe("duplicateExisting");
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings[0].code).toBe("duplicateInFile");
    expect(rows.every((r) => r.input !== null)).toBe(true);
  });

  it("skips fully empty rows but keeps spreadsheet row numbers", () => {
    const empty = Object.fromEntries(Object.keys(validRecord()).map((k) => [k, ""]));
    const rows = parseImportRecords([empty, validRecord()], refs);
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(3);
  });
});

describe("import files", () => {
  const header = Object.keys(validRecord()).join(",");
  const line = Object.values(validRecord()).map((v) => `"${v}"`).join(",");

  it("reads a CSV file", async () => {
    const result = await readImportFile(Buffer.from(`${header}\n${line}\n`), "mapping.csv");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records).toHaveLength(1);
      expect(result.records[0].name).toBe("Month-end accrual check");
      expect(result.records[0].systems).toBe("ERP; Excel");
    }
  });

  it("rejects wrong file types, oversized files and missing columns", async () => {
    expect(await readImportFile(Buffer.from("x"), "mapping.txt")).toEqual({ ok: false, error: "errImportFileType" });
    expect(await readImportFile(Buffer.alloc(1_000_001), "mapping.csv")).toEqual({ ok: false, error: "errImportFileTooLarge" });
    expect(await readImportFile(Buffer.from("name,purpose\nx,y\n"), "mapping.csv")).toEqual({
      ok: false,
      error: "errImportMissingColumns",
    });
  });

  it("builds a CSV template with all columns", () => {
    expect(buildTemplateCsv().trim().split(",")).toEqual(Object.keys(validRecord()));
  });

  it("round-trips the Excel template: fill a row, read it back, validate it", async () => {
    const template = await buildTemplateXlsx({ categories: ["Reconciliation & checks"], units: ["Invoices"], systems: ["ERP"] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Activities", "Instructions"]);

    const sheet = workbook.getWorksheet("Activities")!;
    const record = validRecord();
    sheet.addRow(Object.keys(record).map((k) => record[k]));
    const filled = Buffer.from(await workbook.xlsx.writeBuffer());

    const read = await readImportFile(filled, "mapping.xlsx");
    expect(read.ok).toBe(true);
    if (read.ok) {
      const rows = parseImportRecords(read.records, refs);
      expect(rows).toHaveLength(1);
      expect(rows[0].errors).toEqual([]);
    }
  });
});
