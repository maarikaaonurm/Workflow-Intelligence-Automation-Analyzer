import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export const STANDARD_CATEGORIES = [
  {
    nameEn: "Data entry & processing",
    definitionEt: "Teabe sisestamine, kandmine või ülekandmine süsteemidesse või dokumentidesse.",
    belongsHereEt: "Arvete kandmine; kliendiandmete sisestamine; arvude kopeerimine ühest süsteemist teise.",
    notBelongsHereEt: "Tulemuste kontrollimine või sidumine (Täpsustamine ja kontroll); aruannete koostamine (Aruandlus ja analüüs).",
    boundaryExamplesEt: "Makse sisestamine on andmesisestus; selle kontrollimine pangakonto väljavõttega on täpsustamine.",
    nameEt: "Andmesisestus ja töötlemine",
    definition: "Recording, entering or transferring information into systems or documents.",
    belongsHere: "Posting invoices; entering customer data; copying figures from one system to another.",
    notBelongsHere: "Checking or matching the results (Reconciliation & checks); producing reports (Reporting & analysis).",
    boundaryExamples: "Entering a payment is data entry; confirming that it matches the bank statement is a reconciliation.",
  },
  {
    nameEn: "Reconciliation & checks",
    definitionEt: "Kahe allika teabe võrdlemine või andmete täielikkuse ja õigsuse kontrollimine.",
    belongsHereEt: "Pangakviitungite sidumine; saldode võrdlemine; summade kontrollimine pearaamatu vastu.",
    notBelongsHereEt: "Ametlikud kinnitamised (Kinnitamine ja kontrollid); põhiandmete parandamine (Põhiandmed ja süsteemihooldus).",
    boundaryExamplesEt: "Erinevuse leidmine on kontroll; tulemuse ametlik allkirjastamine on kinnitamine.",
    nameEt: "Täpsustamine ja kontroll",
    definition: "Comparing information from two sources, or verifying that data is complete and correct.",
    belongsHere: "Bank receipt matching; balance comparisons; checking totals against the ledger.",
    notBelongsHere: "Formal approvals (Approvals & controls); correcting master data (Master data & system maintenance).",
    boundaryExamples: "Finding a difference is a check; the formal sign-off of the result is an approval.",
  },
  {
    nameEn: "Reporting & analysis",
    definitionEt: "Aruannete, näitajate ja analüüside koostamine, ülevaatamine või selgitamine.",
    belongsHereEt: "Kuised juhtimisaruanded; kõrvalekallete analüüs; näitajate ettevalmistamine ettekandeks.",
    notBelongsHereEt: "Aluseks olevate andmete sisestamine (Andmesisestus ja töötlemine); koosolek, kus seda arutatakse.",
    boundaryExamplesEt: null,
    nameEt: "Aruandlus ja analüüs",
    definition: "Preparing, reviewing or explaining reports, figures and analyses.",
    belongsHere: "Monthly management reports; variance analysis; preparing figures for a presentation.",
    notBelongsHere: "Entering the underlying data (Data entry & processing); attending the meeting where it is discussed.",
    boundaryExamples: null,
  },
  {
    nameEn: "Communication & coordination",
    definitionEt: "Teabe vahetamine kolleegide või teiste osapooltega väljaspool koosolekuid.",
    belongsHereEt: "Sisemistele küsimustele vastamine; puuduva teabe järele küsimine; ülesande kooskõlastamine teise meeskonnaga.",
    notBelongsHereEt: "Koosolekud (logitakse koosolekuna); klientide juhtumite käsitlemine (Klientide ja huvipoolte teenindus).",
    boundaryExamplesEt: null,
    nameEt: "Suhtlus ja koordineerimine",
    definition: "Exchanging information with colleagues or other parties outside of meetings.",
    belongsHere: "Answering internal questions; chasing missing information; coordinating a task with another team.",
    notBelongsHere: "Meetings (logged as meetings); handling customer cases (Customer & stakeholder handling).",
    boundaryExamples: null,
  },
  {
    nameEn: "Customer & stakeholder handling",
    definitionEt: "Klientide või teiste väliste osapoolte päringute, juhtumite või küsimuste käsitlemine.",
    belongsHereEt: "Kliendi saldopäringule vastamine; ametiasutuse päringu töötlemine.",
    notBelongsHereEt: "Sisemine kooskõlastus (Suhtlus ja koordineerimine).",
    boundaryExamplesEt: null,
    nameEt: "Klientide ja huvipoolte teenindus",
    definition: "Handling requests, cases or questions from customers or other external parties.",
    belongsHere: "Answering a customer balance query; processing a request from an authority.",
    notBelongsHere: "Internal coordination (Communication & coordination).",
    boundaryExamples: null,
  },
  {
    nameEn: "Approvals & controls",
    definitionEt: "Ametlikud kinnitamised, allkirjastamised ja kohustuslikud kontrollietapid.",
    belongsHereEt: "Maksete kinnitamine; kuu lõpu kontrolli allkirjastamine; poliitikaga nõutud teise isiku ülevaatus.",
    notBelongsHereEt: "Kontrolli andmete ettevalmistamine (Andmesisestus ja töötlemine või Täpsustamine ja kontroll).",
    boundaryExamplesEt: "Kontrolli andmete ettevalmistamine ei ole kontroll; siia kuulub ainult ametlik ülevaatuse etapp.",
    nameEt: "Kinnitamine ja kontrollid",
    definition: "Formal approvals, sign-offs and mandatory control steps.",
    belongsHere: "Approving payments; month-end control sign-off; second-person review required by policy.",
    notBelongsHere: "Preparing the data for the control (Data entry & processing or Reconciliation & checks).",
    boundaryExamples: "Preparing the control data is not the control; only the formal review step belongs here.",
  },
  {
    nameEn: "Master data & system maintenance",
    definitionEt: "Viiteandmete, kontode, seadistuste või süsteemi konfiguratsiooni hooldamine.",
    belongsHereEt: "Tarnija põhiandmete parandamine; kontode vastavuste uuendamine; süsteemi seadistuste kohandamine.",
    notBelongsHereEt: "Igapäevaste tehingute sisestamine (Andmesisestus ja töötlemine).",
    boundaryExamplesEt: null,
    nameEt: "Põhiandmed ja süsteemihooldus",
    definition: "Maintaining reference data, accounts, settings or system configuration.",
    belongsHere: "Correcting supplier master data; updating account mappings; adjusting system settings.",
    notBelongsHere: "Entering daily transactions (Data entry & processing).",
    boundaryExamples: null,
  },
  {
    nameEn: "Documentation & filing",
    definitionEt: "Dokumentide ja kirjete koostamine, korrastamine, skaneerimine või arhiveerimine.",
    belongsHereEt: "Tõendavate dokumentide arhiveerimine; protsessijuhendite kirjutamine; kuu lõpu pakettide arhiveerimine.",
    notBelongsHereEt: "Otsuste tegemiseks koostatud aruanded (Aruandlus ja analüüs).",
    boundaryExamplesEt: null,
    nameEt: "Dokumenteerimine ja arhiveerimine",
    definition: "Creating, organizing, scanning or archiving documents and records.",
    belongsHere: "Filing supporting documents; writing process instructions; archiving month-end packages.",
    notBelongsHere: "Reports produced for decisions (Reporting & analysis).",
    boundaryExamples: null,
  },
  {
    nameEn: "Planning & organizing",
    definitionEt: "Oma või meeskonna töö planeerimine, prioriseerimine ja korraldamine.",
    belongsHereEt: "Kuu lõpu ajakava koostamine; ülesannete nimekirja prioriseerimine.",
    notBelongsHereEt: "Koosolekud (logitakse koosolekuna).",
    boundaryExamplesEt: null,
    nameEt: "Planeerimine ja korraldamine",
    definition: "Planning, prioritizing and organizing own or team work.",
    belongsHere: "Preparing the month-end schedule; prioritizing the task list.",
    notBelongsHere: "Meetings (logged as meetings).",
    boundaryExamples: null,
  },
  {
    nameEn: "Other",
    definitionEt: "Korduv töö, mis ei sobi ühtegi teise kategooriasse.",
    belongsHereEt: "Harvad, tõeliselt erinevad korduvad ülesanded.",
    notBelongsHereEt: "Kõik, mis sobib mõnda teise kategooriasse; kasuta seda kategooriat napilt.",
    boundaryExamplesEt: null,
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
    if (!exists) {
      await db.activityCategory.create({ data: { ...c, organizationId, departmentId: null } });
    } else if (exists.definitionEt === null && exists.belongsHereEt === null && exists.notBelongsHereEt === null) {
      // Standard categories created before Estonian content existed get it now; edited ones are left alone.
      await db.activityCategory.update({
        where: { id: exists.id },
        data: {
          definitionEt: c.definitionEt,
          belongsHereEt: c.belongsHereEt,
          notBelongsHereEt: c.notBelongsHereEt,
          boundaryExamplesEt: c.boundaryExamplesEt,
        },
      });
    }
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
