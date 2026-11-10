import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { messages, type Locale } from "@/lib/i18n/messages";
import { headerLookup, IMPORT_COLUMNS, MAX_IMPORT_ROWS, normalizeHeader } from "./import";

export const MAX_IMPORT_BYTES = 1_000_000;
/** Upper bound on rows examined in a sheet, whatever they contain. */
const MAX_SHEET_ROWS = 2000;

/** Version of the standard template layout. The importer accepts only the versions listed here. */
export const TEMPLATE_VERSION = "1.0";
export const SUPPORTED_TEMPLATE_VERSIONS = [TEMPLATE_VERSION];

const LOCALES: Locale[] = ["et", "en"];
const label = (locale: Locale, key: string) => (messages[locale] as Record<string, string>)[key] ?? key;
const META_SHEET = "_meta";

export type ImportFileError =
  | "errImportFileType"
  | "errImportFileTooLarge"
  | "errImportUnreadable"
  | "errImportContentMismatch"
  | "errImportTooManyRows"
  | "errImportMissingColumns"
  | "errImportTemplateVersion";

export type ReadResult =
  | { ok: true; records: Record<string, string>[]; templateVersion: string; templateLanguage: Locale }
  | { ok: false; error: ImportFileError };

/** Downloaded template file name for a language (the name follows the user's interface language). */
export function templateFilename(locale: Locale, extension: "xlsx" | "csv"): string {
  return locale === "et" ? `algse_tegevuskaardistuse_mall.${extension}` : `initial_activity_mapping_template.${extension}`;
}

/**
 * Spreadsheet formula injection protection for text written into a file: a value that would
 * be read as a formula is prefixed so a spreadsheet shows it as plain text.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Keeps only a safe base name for storing: no path, no control characters, bounded length. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80);
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // A formula cell is never evaluated; it is reported so the importer can refuse it.
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) return `=${String(cell.text ?? "")}`;
  return String(cell.text ?? "").trim();
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const looksLikeZip = (b: Buffer) => b.length >= 4 && ZIP_MAGIC.every((byte, i) => b[i] === byte);

/** Reads a template file (.xlsx or .csv), checks its content and version, and returns canonical-keyed rows. */
export async function readImportFile(buffer: Buffer, filename: string): Promise<ReadResult> {
  if (buffer.length > MAX_IMPORT_BYTES) return { ok: false, error: "errImportFileTooLarge" };
  const lower = filename.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) return { ok: false, error: "errImportFileType" };
  // The extension alone is not trusted: an .xlsx must be a zip container, a .csv must be plain text.
  if (isXlsx !== looksLikeZip(buffer)) return { ok: false, error: "errImportContentMismatch" };

  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  let templateVersion = "";
  let templateLanguage: Locale = "en";

  try {
    if (isXlsx) {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const meta = workbook.getWorksheet(META_SHEET);
      templateVersion = meta ? cellText(meta.getCell("B1")) : "";
      templateLanguage = meta && cellText(meta.getCell("B2")) === "et" ? "et" : "en";
      const sheetNames = new Set(LOCALES.map((l) => label(l, "tplSheetActivities")));
      sheet = workbook.worksheets.find((w) => sheetNames.has(w.name));
    } else {
      if (buffer.includes(0)) return { ok: false, error: "errImportContentMismatch" };
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
      const newline = text.search(/\r?\n/);
      const first = newline === -1 ? text : text.slice(0, newline);
      const metaMatch = /^#template_version=([^;]*);language=(\w+)/.exec(first.trim());
      if (metaMatch) {
        templateVersion = metaMatch[1].trim();
        templateLanguage = metaMatch[2] === "et" ? "et" : "en";
      }
      const rest = metaMatch && newline !== -1 ? text.slice(newline + 1) : text;
      sheet = await workbook.csv.read(Readable.from([Buffer.from(rest, "utf-8")]));
    }
  } catch {
    return { ok: false, error: "errImportUnreadable" };
  }
  if (!sheet) return { ok: false, error: "errImportUnreadable" };
  if (!SUPPORTED_TEMPLATE_VERSIONS.includes(templateVersion)) return { ok: false, error: "errImportTemplateVersion" };

  const lookup = headerLookup();
  const headers = new Map<number, string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = lookup.get(normalizeHeader(cellText(cell)));
    if (key) headers.set(col, key);
  });
  const present = new Set(headers.values());
  if (!IMPORT_COLUMNS.filter((c) => c.required).every((c) => present.has(c.key))) {
    return { ok: false, error: "errImportMissingColumns" };
  }
  // Dropdown validation in the template formats empty rows below the data, so the row count alone is
  // not the number of rows filled in. Bound the work first, then count the rows that have content.
  if (sheet.rowCount > MAX_SHEET_ROWS) return { ok: false, error: "errImportTooManyRows" };

  const records: Record<string, string>[] = [];
  let filled = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const record: Record<string, string> = {};
    for (const [col, key] of headers) record[key] = cellText(row.getCell(col));
    if (Object.values(record).some((v) => v !== "")) filled++;
    records.push(record);
  }
  if (filled > MAX_IMPORT_ROWS) return { ok: false, error: "errImportTooManyRows" };
  // Trailing empty rows carry no information.
  while (records.length > 0 && Object.values(records[records.length - 1]).every((v) => v === "")) records.pop();
  return { ok: true, records, templateVersion, templateLanguage };
}

export interface TemplateCategory {
  name: string;
  definition: string;
  belongsHere: string;
  notBelongsHere: string;
}

export interface TemplateLists {
  categories: TemplateCategory[];
  units: string[];
  systems: string[];
}

const heading = (locale: Locale, key: string, required: boolean) => `${label(locale, `col_${key}`)}${required ? " *" : ""}`;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV template: UTF-8 with BOM (so Excel shows Estonian letters), a version line, then the localized headings. */
export function buildTemplateCsv(locale: Locale): string {
  const meta = `#template_version=${TEMPLATE_VERSION};language=${locale}`;
  const headings = IMPORT_COLUMNS.map((c) => csvCell(heading(locale, c.key, c.required)));
  return `﻿${meta}\n${headings.join(",")}\n`;
}

/** Accepted localized values for a column, as shown in the template. */
export function acceptedValues(locale: Locale, column: (typeof IMPORT_COLUMNS)[number]): string[] | null {
  if ("enumValues" in column) return column.enumValues.map((code) => label(locale, `${column.prefix}${code}`));
  if ("yesNo" in column) return [label(locale, "yes"), label(locale, "no")];
  return null;
}

/** The standard Excel template: Instructions, Activities (with dropdowns) and Reference Data, in one language. */
export async function buildTemplateXlsx(locale: Locale, lists: TemplateLists): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const t = (key: string) => label(locale, key);

  // --- Instructions ---
  const help = workbook.addWorksheet(t("tplSheetInstructions"));
  help.getColumn(1).width = 34;
  help.getColumn(2).width = 14;
  help.getColumn(3).width = 70;
  help.getColumn(4).width = 60;
  help.addRow([t("tplInstrTitle")]).font = { bold: true, size: 14 };
  for (let i = 1; i <= 7; i++) help.addRow([t(`tplInstr${i}`)]);
  help.addRow([]);
  help.addRow([t("tplColumn"), t("tplRequirement"), t("tplHelp"), t("tplAccepted")]).font = { bold: true };
  for (const column of IMPORT_COLUMNS) {
    const accepted = acceptedValues(locale, column);
    help.addRow([
      heading(locale, column.key, column.required),
      column.required ? t("tplRequired") : t("tplOptional"),
      t(`help_${column.key}`),
      accepted ? accepted.join(" / ") : "",
    ]);
  }
  help.addRow([]);
  help.addRow([t("tplExampleTitle")]).font = { bold: true };
  help.addRow([t("tplExampleNote")]);

  const firstCategory = lists.categories[0]?.name ?? "";
  const firstUnit = lists.units[0] ?? "";
  const firstSystem = lists.systems[0] ?? "";
  const examples: string[][] = [
    [t("tplExName1"), t("tplExDesc1"), t("tplExPurpose1"), t("recipientMANAGER"), "", firstCategory, "", t("freqMONTHLY"), "1", "90", "45", firstUnit, firstSystem, t("autoPARTIAL"), t("degreeHIGH"), t("degreeLOW"), t("excOCCASIONAL"), t("yes"), t("no"), t("occNONE"), t("occSOMETIMES"), t("seasonEND_OF_MONTH"), t("sensFINANCIAL"), t("yes"), t("tplExSuggestion")],
    [t("tplExName2"), t("tplExDesc2"), t("tplExPurpose2"), t("recipientSYSTEM"), "", firstCategory, "", t("freqDAILY"), "1", "30", "", "", firstSystem, t("autoMANUAL"), t("degreeHIGH"), t("degreeLOW"), t("excRARE"), t("no"), t("no"), t("occNONE"), t("occNONE"), t("seasonEVEN"), t("sensNONE"), t("no"), ""],
  ];
  help.addRow(IMPORT_COLUMNS.map((c) => heading(locale, c.key, c.required))).font = { bold: true };
  for (const row of examples) help.addRow(row.map(neutralizeFormula));

  // --- Activities ---
  const activities = workbook.addWorksheet(t("tplSheetActivities"));
  activities.addRow(IMPORT_COLUMNS.map((c) => heading(locale, c.key, c.required)));
  activities.getRow(1).font = { bold: true };
  activities.views = [{ state: "frozen", ySplit: 1 }];

  // --- Reference data ---
  const reference = workbook.addWorksheet(t("tplSheetReference"));
  const refHeaders = [t("tplRefCategory"), t("tplRefDefinition"), t("tplRefBelongs"), t("tplRefNotBelongs"), "", t("tplRefUnit"), "", t("tplRefSystem")];
  reference.addRow(refHeaders).font = { bold: true };
  const rowsNeeded = Math.max(lists.categories.length, lists.units.length, lists.systems.length);
  for (let i = 0; i < rowsNeeded; i++) {
    const c = lists.categories[i];
    reference.addRow([
      c ? neutralizeFormula(c.name) : "",
      c ? neutralizeFormula(c.definition) : "",
      c ? neutralizeFormula(c.belongsHere) : "",
      c ? neutralizeFormula(c.notBelongsHere) : "",
      "",
      lists.units[i] ? neutralizeFormula(lists.units[i]) : "",
      "",
      lists.systems[i] ? neutralizeFormula(lists.systems[i]) : "",
    ]);
  }
  [30, 50, 50, 50, 3, 22, 3, 28].forEach((w, i) => (reference.getColumn(i + 1).width = w));
  const refRange = (column: string, count: number) => `'${t("tplSheetReference")}'!$${column}$2:$${column}$${Math.max(2, count + 1)}`;

  IMPORT_COLUMNS.forEach((column, index) => {
    activities.getColumn(index + 1).width = Math.max(16, heading(locale, column.key, column.required).length + 4);
    let formula: string | null = null;
    if (column.key === "primary_category") formula = refRange("A", lists.categories.length);
    else if (column.key === "volume_unit") formula = refRange("F", lists.units.length);
    else if (column.key === "systems") formula = null; // several systems are allowed, separated by ";"
    else if (column.key === "sensitive_data") formula = null; // several categories are allowed
    else {
      const accepted = acceptedValues(locale, column);
      if (accepted) formula = `"${accepted.join(",")}"`;
    }
    if (formula) {
      for (let r = 2; r <= 201; r++) {
        activities.getCell(r, index + 1).dataValidation = { type: "list", allowBlank: !column.required, formulae: [formula] };
      }
    }
  });

  // --- Machine-readable template identity (hidden) ---
  const meta = workbook.addWorksheet(META_SHEET);
  meta.addRow(["template_version", TEMPLATE_VERSION]);
  meta.addRow(["template_language", locale]);
  meta.state = "veryHidden";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
