import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  acceptedValues,
  buildTemplateCsv,
  buildTemplateXlsx,
  neutralizeFormula,
  readImportFile,
  sanitizeFilename,
  templateFilename,
  TEMPLATE_VERSION,
} from "./files";
import { IMPORT_COLUMNS, parseImportRecords } from "./import";
import { messages } from "@/lib/i18n/messages";
import { recordEn, recordEt, refs } from "./test-fixtures";

const lists = {
  categories: [{ name: "Reconciliation & checks", definition: "d", belongsHere: "b", notBelongsHere: "n" }],
  units: ["Invoices"],
  systems: ["ERP", "Excel"],
};
const listsEt = { ...lists, categories: [{ name: "Täpsustamine ja kontroll", definition: "d", belongsHere: "b", notBelongsHere: "n" }], units: ["Arved"] };

const headingRow = (locale: "en" | "et") =>
  IMPORT_COLUMNS.map((c) => `${(messages[locale] as Record<string, string>)[`col_${c.key}`]}${c.required ? " *" : ""}`);

const csvOf = (locale: "en" | "et", record: Record<string, string>) => {
  const header = buildTemplateCsv(locale).split("\n")[0] + "\n" + buildTemplateCsv(locale).split("\n")[1] + "\n";
  const cells = IMPORT_COLUMNS.map((c) => `"${(record[c.key] ?? "").replace(/"/g, '""')}"`).join(",");
  return Buffer.from(header + cells + "\n", "utf-8");
};

async function filledXlsx(locale: "en" | "et", record: Record<string, string>) {
  const template = await buildTemplateXlsx(locale, locale === "et" ? listsEt : lists);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(messages[locale].tplSheetActivities)!;
  sheet.addRow(IMPORT_COLUMNS.map((c) => record[c.key] ?? ""));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("localized template files", () => {
  it("names the files after the interface language", () => {
    expect(templateFilename("et", "xlsx")).toBe("algse_tegevuskaardistuse_mall.xlsx");
    expect(templateFilename("et", "csv")).toBe("algse_tegevuskaardistuse_mall.csv");
    expect(templateFilename("en", "xlsx")).toBe("initial_activity_mapping_template.xlsx");
    expect(templateFilename("en", "csv")).toBe("initial_activity_mapping_template.csv");
  });

  it("builds an Estonian and an English Excel template with localized sheets, headings and dropdown values", async () => {
    for (const locale of ["et", "en"] as const) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load((await buildTemplateXlsx(locale, locale === "et" ? listsEt : lists)) as unknown as ArrayBuffer);
      const m = messages[locale];
      expect(workbook.worksheets.map((w) => w.name)).toEqual([m.tplSheetInstructions, m.tplSheetActivities, m.tplSheetReference, "_meta"]);

      const activities = workbook.getWorksheet(m.tplSheetActivities)!;
      expect(activities.getRow(1).values).toEqual([undefined, ...headingRow(locale)]);

      const instructions = workbook.getWorksheet(m.tplSheetInstructions)!;
      const text = JSON.stringify(instructions.getSheetValues());
      expect(text).toContain(m.tplInstrTitle);
      expect(text).toContain(m.tplExName1);
      // Controlled values are listed in the language of the template.
      expect(text).toContain(locale === "et" ? "Igapäevane" : "Daily");
      expect(text).not.toContain(locale === "et" ? "Daily" : "Igapäevane");

      // Dropdown for frequency uses the localized labels.
      const freqColumn = IMPORT_COLUMNS.findIndex((c) => c.key === "frequency") + 1;
      const validation = activities.getCell(2, freqColumn).dataValidation;
      expect(validation.formulae[0]).toContain(m.freqDAILY);
      // Reference data holds the localized category.
      const reference = workbook.getWorksheet(m.tplSheetReference)!;
      expect(String(reference.getCell("A2").value)).toBe(locale === "et" ? "Täpsustamine ja kontroll" : "Reconciliation & checks");
    }
  });

  it("carries a machine-readable template version and language", async () => {
    for (const locale of ["et", "en"] as const) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load((await buildTemplateXlsx(locale, lists)) as unknown as ArrayBuffer);
      const meta = workbook.getWorksheet("_meta")!;
      expect(meta.state).toBe("veryHidden");
      expect(String(meta.getCell("B1").value)).toBe(TEMPLATE_VERSION);
      expect(String(meta.getCell("B2").value)).toBe(locale);
    }
  });

  it("builds localized CSV templates with a BOM, a version line and localized headings", () => {
    for (const locale of ["et", "en"] as const) {
      const csv = buildTemplateCsv(locale);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const [meta, headings] = csv.slice(1).split("\n");
      expect(meta).toBe(`#template_version=${TEMPLATE_VERSION};language=${locale}`);
      expect(headings).toContain((messages[locale] as Record<string, string>).col_name);
    }
    expect(buildTemplateCsv("et")).not.toBe(buildTemplateCsv("en"));
  });

  it("offers every controlled value in both languages for the same canonical codes", () => {
    for (const column of IMPORT_COLUMNS) {
      const et = acceptedValues("et", column);
      const en = acceptedValues("en", column);
      expect(et?.length).toBe(en?.length);
    }
    expect(acceptedValues("et", IMPORT_COLUMNS.find((c) => c.key === "frequency")!)).toContain("Igapäevane");
    expect(acceptedValues("en", IMPORT_COLUMNS.find((c) => c.key === "frequency")!)).toContain("Daily");
  });
});

describe("reading templates", () => {
  it("imports the Estonian Excel template to canonical values", async () => {
    const read = await readImportFile(await filledXlsx("et", recordEt()), "algse_tegevuskaardistuse_mall.xlsx");
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.templateVersion).toBe("1.0");
      expect(read.templateLanguage).toBe("et");
      const [row] = parseImportRecords(read.records, refs, "et");
      expect(row.status).toBe("READY");
      expect(row.input).toMatchObject({ frequency: "MONTHLY", primaryCategoryId: "cat1", sensitiveData: ["FINANCIAL"] });
    }
  });

  it("imports the English Excel template to the same canonical values", async () => {
    const en = await readImportFile(await filledXlsx("en", recordEn()), "initial_activity_mapping_template.xlsx");
    const et = await readImportFile(await filledXlsx("et", recordEt()), "x.xlsx");
    expect(en.ok && et.ok).toBe(true);
    if (en.ok && et.ok) {
      expect(parseImportRecords(en.records, refs, "en")[0].input).toEqual(parseImportRecords(et.records, refs, "et")[0].input);
    }
  });

  it("imports both CSV templates", async () => {
    for (const [locale, record] of [["et", recordEt()], ["en", recordEn()]] as const) {
      const read = await readImportFile(csvOf(locale, record), "mapping.csv");
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect(read.templateLanguage).toBe(locale);
        expect(parseImportRecords(read.records, refs, locale)[0].status).toBe("READY");
      }
    }
  });

  it("rejects a file with a missing or unsupported template version and offers the current template", async () => {
    const noVersion = Buffer.from(buildTemplateCsv("en").split("\n").slice(1).join("\n"), "utf-8");
    expect(await readImportFile(noVersion, "old.csv")).toEqual({ ok: false, error: "errImportTemplateVersion" });
    const future = Buffer.from(buildTemplateCsv("en").replace("version=1.0", "version=9.9"), "utf-8");
    expect(await readImportFile(future, "future.csv")).toEqual({ ok: false, error: "errImportTemplateVersion" });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplateXlsx("en", lists)) as unknown as ArrayBuffer);
    workbook.getWorksheet("_meta")!.getCell("B1").value = "2.0";
    expect(await readImportFile(Buffer.from(await workbook.xlsx.writeBuffer()), "v2.xlsx")).toEqual({ ok: false, error: "errImportTemplateVersion" });
  });

  it("reports a missing required column", async () => {
    const csv = Buffer.from(`#template_version=1.0;language=en\n${(messages.en as Record<string, string>).col_name},${(messages.en as Record<string, string>).col_purpose}\nx,y\n`);
    expect(await readImportFile(csv, "partial.csv")).toEqual({ ok: false, error: "errImportMissingColumns" });
  });

  it("rejects an unsupported type, an oversized file and a file whose content does not match its extension", async () => {
    expect(await readImportFile(Buffer.from("x"), "mapping.xls")).toEqual({ ok: false, error: "errImportFileType" });
    expect(await readImportFile(Buffer.from("x"), "mapping.xlsm")).toEqual({ ok: false, error: "errImportFileType" });
    expect(await readImportFile(Buffer.alloc(1_000_001), "mapping.csv")).toEqual({ ok: false, error: "errImportFileTooLarge" });
    // plain text named .xlsx, and a zip named .csv
    expect(await readImportFile(Buffer.from("not a zip"), "fake.xlsx")).toEqual({ ok: false, error: "errImportContentMismatch" });
    expect(await readImportFile(await buildTemplateXlsx("en", lists), "disguised.csv")).toEqual({ ok: false, error: "errImportContentMismatch" });
    expect(await readImportFile(Buffer.from([0x23, 0x00, 0x01, 0x02]), "binary.csv")).toEqual({ ok: false, error: "errImportContentMismatch" });
  });

  it("rejects a file that is not a readable workbook or is not valid text", async () => {
    expect(await readImportFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]), "broken.xlsx")).toEqual({ ok: false, error: "errImportUnreadable" });
    expect(await readImportFile(Buffer.from([0xff, 0xfe, 0xfa, 0xfb]), "latin.csv")).toEqual({ ok: false, error: "errImportUnreadable" });
  });

  it("never evaluates formula cells: they surface as a rejected value", async () => {
    const template = await buildTemplateXlsx("en", lists);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Activities")!;
    sheet.addRow(IMPORT_COLUMNS.map((c) => (c.key === "name" ? { formula: "1+1", result: 2 } : (recordEn()[c.key] ?? ""))));
    const read = await readImportFile(Buffer.from(await workbook.xlsx.writeBuffer()), "formula.xlsx");
    expect(read.ok).toBe(true);
    if (read.ok) {
      const row = parseImportRecords(read.records, refs)[0];
      expect(row.status).toBe("ERROR");
      expect(row.errors).toContainEqual({ field: "name", code: "formula" });
    }
  });

  it("rejects a file with more than 200 rows", async () => {
    const rows = Array.from({ length: 201 }, () => IMPORT_COLUMNS.map(() => "x").join(",")).join("\n");
    const csv = Buffer.from(`${buildTemplateCsv("en")}${rows}\n`);
    expect(await readImportFile(csv, "big.csv")).toEqual({ ok: false, error: "errImportTooManyRows" });
  });
});

describe("file safety helpers", () => {
  it("neutralizes values that a spreadsheet would read as formulas", () => {
    for (const v of ["=1+1", "+1", "-1", "@x", "\tx"]) expect(neutralizeFormula(v).startsWith("'")).toBe(true);
    expect(neutralizeFormula("Reconciliation")).toBe("Reconciliation");
  });

  it("writes user-controlled reference text into the template as plain text", async () => {
    const hostile = { ...lists, categories: [{ name: "=cmd|calc", definition: "+x", belongsHere: "@y", notBelongsHere: "-z" }] };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildTemplateXlsx("en", hostile)) as unknown as ArrayBuffer);
    const reference = workbook.getWorksheet("Reference Data")!;
    for (const column of ["A", "B", "C", "D"]) expect(String(reference.getCell(`${column}2`).value).startsWith("'")).toBe(true);
  });

  it("keeps only a safe base file name", () => {
    expect(sanitizeFilename("C:\\Users\\me\\report.xlsx")).toBe("report.xlsx");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("na\u0000me<>|.csv")).toBe("name.csv");
    expect(sanitizeFilename("a".repeat(300)).length).toBe(80);
  });
});
