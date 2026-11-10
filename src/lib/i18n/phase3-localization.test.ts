import { describe, expect, it } from "vitest";
import { messages, type MessageKey } from "./messages";
import { STANDARD_CATEGORIES, STANDARD_UNITS } from "@/lib/reference/standard";
import { localizeCategory } from "@/lib/mapping/present";
import { IMPORT_COLUMNS } from "@/lib/mapping/import";
import { FREQUENCIES, OUTPUT_RECIPIENTS, SEASONALITIES, SENSITIVE_CATEGORIES } from "@/lib/mapping/options";

const en = messages.en as Record<string, string>;
const et = messages.et as Record<string, string>;

/** Phase 3 screens, templates, validation and category content. */
const PHASE3_PREFIXES = [
  "col_", "help_", "tpl", "imp", "step", "mapStatus", "freq", "recipient", "auto", "degree", "exc", "occ", "season", "sens",
  "field_", "source", "row", "optionA", "optionB", "completion", "warn", "version", "category", "belongsHere", "notBelongsHere",
  "boundaryExamples", "definition", "readiness", "mappingReadiness", "importResult", "downloadTemplate", "continueToConfirm",
  "confirmImport", "cancelImport", "backToPreview", "supportedFiles", "startMapping", "continueMapping", "viewMapping",
];

/** Words that are legitimately identical in both languages. */
const SAME_IN_BOTH = new Set(["minutesShort", "colStatus", "tplExName1", "field_tags", "field_volume", "col_volume", "colVolume", "rowN", "importRowN"]);

describe("Phase 3 localization", () => {
  const keys = Object.keys(en).filter((k) => PHASE3_PREFIXES.some((p) => k.startsWith(p)));

  it("has an Estonian text for every Phase 3 English text, and none is left in English", () => {
    expect(keys.length).toBeGreaterThan(200);
    const missingOrCopied = keys.filter((k) => !SAME_IN_BOTH.has(k) && (!et[k] || et[k].trim() === "" || et[k] === en[k]));
    expect(missingOrCopied).toEqual([]);
  });

  it("has no English template wording on the Estonian side and no Estonian on the English side", () => {
    const estonianLetters = /[äöõüšž]/i;
    const phase3English = keys.filter((k) => !SAME_IN_BOTH.has(k)).map((k) => en[k]);
    // English UI text never needs Estonian-only letters (a fixed example may contain a quoted name).
    expect(phase3English.filter((v) => estonianLetters.test(v))).toEqual(["Reason"].filter(() => false));
  });

  it("labels every controlled value in both languages with different texts", () => {
    const families: [string, readonly string[]][] = [
      ["freq", FREQUENCIES],
      ["recipient", OUTPUT_RECIPIENTS],
      ["season", SEASONALITIES],
      ["sens", SENSITIVE_CATEGORIES],
    ];
    for (const [prefix, codes] of families) {
      for (const code of codes) {
        expect(en[`${prefix}${code}`]).toBeTruthy();
        expect(et[`${prefix}${code}`]).toBeTruthy();
        expect(et[`${prefix}${code}`]).not.toBe(en[`${prefix}${code}`]);
      }
    }
    expect(et.freqDAILY).toBe("Igapäevane");
    expect(en.freqDAILY).toBe("Daily");
  });

  it("localizes every template column heading, help text and instruction line", () => {
    for (const column of IMPORT_COLUMNS) {
      expect(en[`col_${column.key}`]).toBeTruthy();
      expect(et[`col_${column.key}`]).toBeTruthy();
      expect(en[`help_${column.key}`]).toBeTruthy();
      expect(et[`help_${column.key}`]).toBeTruthy();
    }
    for (let i = 1; i <= 7; i++) expect(et[`tplInstr${i}`]).not.toBe(en[`tplInstr${i}`]);
  });

  it("names the Estonian import action as required", () => {
    expect(et.importCompletedTemplate).toBe("Laadi täidetud mall üles");
    expect(en.importCompletedTemplate).toBe("Import completed template");
  });
});

describe("standard category content", () => {
  it("has the whole card in both languages, so the guide, the form and the template are never mixed", () => {
    for (const c of STANDARD_CATEGORIES) {
      expect(c.nameEt).toBeTruthy();
      expect(c.definitionEt).toBeTruthy();
      expect(c.belongsHereEt).toBeTruthy();
      expect(c.notBelongsHereEt).toBeTruthy();
      expect(c.definitionEt).not.toBe(c.definition);
      expect(c.belongsHereEt).not.toBe(c.belongsHere);
      // A boundary example exists in Estonian exactly when it exists in English.
      expect(Boolean(c.boundaryExamplesEt)).toBe(Boolean(c.boundaryExamples));
    }
  });

  it("shows a standard category entirely in the selected language", () => {
    for (const c of STANDARD_CATEGORIES) {
      const estonian = localizeCategory(c, "et");
      expect(estonian.definition).toBe(c.definitionEt);
      expect(estonian.belongsHere).toBe(c.belongsHereEt);
      expect(estonian.notBelongsHere).toBe(c.notBelongsHereEt);
      const english = localizeCategory(c, "en");
      expect(english.definition).toBe(c.definition);
    }
  });

  it("has Estonian names for the standard volume units", () => {
    for (const u of STANDARD_UNITS) {
      expect(u.nameEt).toBeTruthy();
      expect(u.nameEn).toBeTruthy();
    }
  });

  it("keeps the message catalogs complete", () => {
    expect(Object.keys(et).sort()).toEqual(Object.keys(en).sort() as MessageKey[]);
  });
});
