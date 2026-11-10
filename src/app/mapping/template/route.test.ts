import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { messages } from "@/lib/i18n/messages";

/* eslint-disable @typescript-eslint/no-explicit-any */
const state = vi.hoisted(() => ({ locale: "en" as "en" | "et", user: null as any }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/i18n/server", () => ({ getT: async () => ({ locale: state.locale }) }));
vi.mock("@/lib/services/reference", () => ({
  listReferenceData: async () => ({
    categories: [
      {
        id: "c1", nameEn: "Reporting & analysis", nameEt: "Aruandlus ja analüüs", definition: "Def", belongsHere: "B", notBelongsHere: "N", boundaryExamples: null,
        definitionEt: "Definitsioon", belongsHereEt: "Siia", notBelongsHereEt: "Mitte", boundaryExamplesEt: null,
      },
    ],
    units: [{ id: "u1", key: "invoices", nameEn: "Invoices", nameEt: "Arved" }],
    systems: [{ id: "s1", name: "Excel" }],
  }),
}));

import { GET } from "./route";

const participant = { actor: { id: "u", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" } };
const request = (format: string) => new Request(`http://localhost/mapping/template?format=${format}`);
const disposition = (r: Response) => r.headers.get("Content-Disposition");

beforeEach(() => {
  state.user = participant;
  state.locale = "en";
});

describe("template download follows the interface language", () => {
  it("gives the Estonian Excel template when the interface is Estonian", async () => {
    state.locale = "et";
    const response = await GET(request("xlsx"));
    expect(disposition(response)).toBe('attachment; filename="algse_tegevuskaardistuse_mall.xlsx"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.arrayBuffer()) as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Juhised", "Tegevused", "Viiteandmed", "_meta"]);
    expect(String(workbook.getWorksheet("Viiteandmed")!.getCell("A2").value)).toBe("Aruandlus ja analüüs");
    expect(String(workbook.getWorksheet("_meta")!.getCell("B2").value)).toBe("et");
  });

  it("gives the English Excel template when the interface is English", async () => {
    const response = await GET(request("xlsx"));
    expect(disposition(response)).toBe('attachment; filename="initial_activity_mapping_template.xlsx"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.arrayBuffer()) as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Instructions", "Activities", "Reference Data", "_meta"]);
    expect(String(workbook.getWorksheet("Reference Data")!.getCell("A2").value)).toBe("Reporting & analysis");
    expect(String(workbook.getWorksheet("_meta")!.getCell("B2").value)).toBe("en");
  });

  it("gives the Estonian CSV template when the interface is Estonian", async () => {
    state.locale = "et";
    const response = await GET(request("csv"));
    expect(disposition(response)).toBe('attachment; filename="algse_tegevuskaardistuse_mall.csv"');
    const text = await response.text();
    expect(text).toContain("language=et");
    expect(text).toContain(messages.et.col_name);
    expect(text).not.toContain(messages.en.col_name);
  });

  it("gives the English CSV template when the interface is English", async () => {
    const response = await GET(request("csv"));
    expect(disposition(response)).toBe('attachment; filename="initial_activity_mapping_template.csv"');
    const text = await response.text();
    expect(text).toContain("language=en");
    expect(text).toContain(messages.en.col_name);
  });

  it("is only for signed-in department members", async () => {
    state.user = null;
    expect((await GET(request("xlsx"))).status).toBe(403);
    state.user = { actor: { ...participant.actor, isOrgAdmin: true, departmentRole: null, departmentId: null } };
    expect((await GET(request("csv"))).status).toBe(403);
  });
});
