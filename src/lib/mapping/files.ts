import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, normalizeHeader } from "./import";

export const MAX_IMPORT_BYTES = 1_000_000;

export type ReadResult =
  | { ok: true; records: Record<string, string>[] }
  | { ok: false; error: "errImportFileType" | "errImportFileTooLarge" | "errImportUnreadable" | "errImportTooManyRows" | "errImportMissingColumns" };

const ACTIVITIES_SHEET = "Activities";

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(cell.text ?? "").trim();
}

/** Reads the first data sheet of an .xlsx file or a .csv file into header-keyed records. */
export async function readImportFile(buffer: Buffer, filename: string): Promise<ReadResult> {
  if (buffer.length > MAX_IMPORT_BYTES) return { ok: false, error: "errImportFileTooLarge" };
  const lower = filename.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) return { ok: false, error: "errImportFileType" };

  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (isXlsx) {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      sheet = workbook.getWorksheet(ACTIVITIES_SHEET) ?? workbook.worksheets[0];
    } else {
      sheet = await workbook.csv.read(Readable.from([buffer]));
    }
  } catch {
    return { ok: false, error: "errImportUnreadable" };
  }
  if (!sheet) return { ok: false, error: "errImportUnreadable" };

  const headers = new Map<number, string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = normalizeHeader(cellText(cell));
    if (h) headers.set(col, h);
  });
  const headerNames = new Set(headers.values());
  if (!IMPORT_COLUMNS.filter((c) => c.required).every((c) => headerNames.has(c.key))) {
    return { ok: false, error: "errImportMissingColumns" };
  }
  if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) return { ok: false, error: "errImportTooManyRows" };

  const records: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const record: Record<string, string> = {};
    for (const [col, header] of headers) record[header] = cellText(row.getCell(col));
    records.push(record);
  }
  return { ok: true, records };
}

export interface TemplateLists {
  categories: string[];
  units: string[];
  systems: string[];
}

export function buildTemplateCsv(): string {
  return IMPORT_COLUMNS.map((c) => c.key).join(",") + "\n";
}

/** The standard Excel template: a header sheet with dropdowns plus an instructions sheet. */
export async function buildTemplateXlsx(lists: TemplateLists): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(ACTIVITIES_SHEET);
  sheet.addRow(IMPORT_COLUMNS.map((c) => c.key));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  IMPORT_COLUMNS.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(16, column.key.length + 4);
    const options = "enumValues" in column ? [...column.enumValues] : "yesNo" in column ? ["yes", "no"] : null;
    // Dropdowns only for single-value columns; sensitive_data accepts a ";" separated list.
    if (options && column.key !== "sensitive_data") {
      for (let r = 2; r <= 101; r++) {
        sheet.getCell(r, index + 1).dataValidation = {
          type: "list",
          allowBlank: !column.required,
          formulae: [`"${options.join(",")}"`],
        };
      }
    }
  });

  const help = workbook.addWorksheet("Instructions");
  help.getColumn(1).width = 26;
  help.getColumn(2).width = 90;
  help.addRow(["Column", "Required / accepted values"]).font = { bold: true };
  for (const column of IMPORT_COLUMNS) {
    const accepted =
      "enumValues" in column ? column.enumValues.join(", ") : "yesNo" in column ? "yes, no" : "free text or number";
    help.addRow([column.key, `${column.required ? "Required" : "Optional"}. ${accepted}`]);
  }
  help.addRow([]);
  help.addRow(["Lists", 'Separate several values with ";" (tags, systems, sensitive_data). "NONE" in sensitive_data cannot be combined with other values.']);
  help.addRow(["primary_category", lists.categories.join("; ")]);
  help.addRow(["volume_unit", `${lists.units.join("; ")} (volume and volume_unit go together)`]);
  help.addRow(["systems", lists.systems.join("; ")]);
  help.addRow(["occurrence_count", "Number of times per frequency period (for ad hoc work: per month)."]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
