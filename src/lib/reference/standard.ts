import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export const STANDARD_CATEGORIES = [
  {
    nameEn: "Data entry & processing",
    nameEt: "Andmesisestus ja töötlemine",
    definition: "Recording, entering or transferring information into systems or documents.",
    belongsHere: "Posting invoices; entering customer data; copying figures from one system to another.",
    notBelongsHere: "Checking or matching the results (Reconciliation & checks); producing reports (Reporting & analysis).",
    boundaryExamples: "Entering a payment is data entry; confirming that it matches the bank statement is a reconciliation.",
  },
  {
    nameEn: "Reconciliation & checks",
    nameEt: "Täpsustamine ja kontroll",
    definition: "Comparing information from two sources, or verifying that data is complete and correct.",
    belongsHere: "Bank receipt matching; balance comparisons; checking totals against the ledger.",
    notBelongsHere: "Formal approvals (Approvals & controls); correcting master data (Master data & system maintenance).",
    boundaryExamples: "Finding a difference is a check; the formal sign-off of the result is an approval.",
  },
  {
    nameEn: "Reporting & analysis",
    nameEt: "Aruandlus ja analüüs",
    definition: "Preparing, reviewing or explaining reports, figures and analyses.",
    belongsHere: "Monthly management reports; variance analysis; preparing figures for a presentation.",
    notBelongsHere: "Entering the underlying data (Data entry & processing); attending the meeting where it is discussed.",
    boundaryExamples: null,
  },
  {
    nameEn: "Communication & coordination",
    nameEt: "Suhtlus ja koordineerimine",
    definition: "Exchanging information with colleagues or other parties outside of meetings.",
    belongsHere: "Answering internal questions; chasing missing information; coordinating a task with another team.",
    notBelongsHere: "Meetings (logged as meetings); handling customer cases (Customer & stakeholder handling).",
    boundaryExamples: null,
  },
  {
    nameEn: "Customer & stakeholder handling",
    nameEt: "Klientide ja huvipoolte teenindus",
    definition: "Handling requests, cases or questions from customers or other external parties.",
    belongsHere: "Answering a customer balance query; processing a request from an authority.",
    notBelongsHere: "Internal coordination (Communication & coordination).",
    boundaryExamples: null,
  },
  {
    nameEn: "Approvals & controls",
    nameEt: "Kinnitamine ja kontrollid",
    definition: "Formal approvals, sign-offs and mandatory control steps.",
    belongsHere: "Approving payments; month-end control sign-off; second-person review required by policy.",
    notBelongsHere: "Preparing the data for the control (Data entry & processing or Reconciliation & checks).",
    boundaryExamples: "Preparing the control data is not the control; only the formal review step belongs here.",
  },
  {
    nameEn: "Master data & system maintenance",
    nameEt: "Põhiandmed ja süsteemihooldus",
    definition: "Maintaining reference data, accounts, settings or system configuration.",
    belongsHere: "Correcting supplier master data; updating account mappings; adjusting system settings.",
    notBelongsHere: "Entering daily transactions (Data entry & processing).",
    boundaryExamples: null,
  },
  {
    nameEn: "Documentation & filing",
    nameEt: "Dokumenteerimine ja arhiveerimine",
    definition: "Creating, organizing, scanning or archiving documents and records.",
    belongsHere: "Filing supporting documents; writing process instructions; archiving month-end packages.",
    notBelongsHere: "Reports produced for decisions (Reporting & analysis).",
    boundaryExamples: null,
  },
  {
    nameEn: "Planning & organizing",
    nameEt: "Planeerimine ja korraldamine",
    definition: "Planning, prioritizing and organizing own or team work.",
    belongsHere: "Preparing the month-end schedule; prioritizing the task list.",
    notBelongsHere: "Meetings (logged as meetings).",
    boundaryExamples: null,
  },
  {
    nameEn: "Other",
    nameEt: "Muu",
    definition: "Recurring work that does not fit any other category.",
    belongsHere: "Rare, genuinely different recurring tasks.",
    notBelongsHere: "Anything that fits another category; use this one sparingly.",
    boundaryExamples: null,
  },
];

export const STANDARD_UNITS = [
  { key: "invoices", nameEn: "Invoices", nameEt: "Arved" },
  { key: "documents", nameEn: "Documents", nameEt: "Dokumendid" },
  { key: "files", nameEn: "Files", nameEt: "Failid" },
  { key: "customers", nameEn: "Customers", nameEt: "Kliendid" },
  { key: "requests", nameEn: "Requests", nameEt: "Päringud" },
  { key: "transactions", nameEn: "Transactions", nameEt: "Tehingud" },
  { key: "reports", nameEn: "Reports", nameEt: "Aruanded" },
  { key: "cases", nameEn: "Cases", nameEt: "Juhtumid" },
  { key: "journal_entries", nameEn: "Journal entries", nameEt: "Memoriaalordrid" },
  { key: "other", nameEn: "Other", nameEt: "Muu" },
];

// Generic, fictional placeholder system names for the prototype.
export const STANDARD_SYSTEMS = ["ERP system", "Bank portal", "Excel", "Email", "Reporting tool", "Document archive"];

/** Adds any missing standard categories, units and systems. Safe to run repeatedly. */
export async function ensureStandardReferenceData(db: Client, organizationId: string): Promise<void> {
  for (const c of STANDARD_CATEGORIES) {
    const exists = await db.activityCategory.findFirst({
      where: { organizationId, departmentId: null, nameEn: c.nameEn },
    });
    if (!exists) await db.activityCategory.create({ data: { ...c, organizationId, departmentId: null } });
  }
  for (const u of STANDARD_UNITS) {
    await db.volumeUnit.upsert({
      where: { organizationId_key: { organizationId, key: u.key } },
      update: {},
      create: { ...u, organizationId },
    });
  }
  for (const name of STANDARD_SYSTEMS) {
    await db.systemReference.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { name, organizationId },
    });
  }
}
