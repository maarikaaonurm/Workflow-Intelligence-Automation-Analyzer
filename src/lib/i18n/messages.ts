export const LOCALES = ["en", "et"] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  appName: "Workflow Intelligence & Automation Analyzer",
  tagline: "Analyze activities and workflows, not people.",
  signIn: "Sign in",
  signOut: "Sign out",
  demoAccounts: "Demo accounts (synthetic data)",
  devLoginDisabled: "Development login is disabled.",
  home: "Home",
  departments: "Departments",
  department: "Department",
  welcome: "Welcome",
  role: "Role",
  roleADMIN: "Organization Admin",
  roleMANAGER: "Department Manager",
  roleEMPLOYEE: "Employee",
  createDepartment: "Create department",
  departmentName: "Department name",
  create: "Create",
  manager: "Manager",
  noManager: "No manager assigned",
  assignManager: "Assign manager",
  members: "Members",
  nextSteps: "Campaigns, activity mapping and the activity diary arrive in the next phases.",
  forbidden: "You do not have access to this page.",
} as const;

export type MessageKey = keyof typeof en;

const et: Record<MessageKey, string> = {
  appName: "Töövoo analüüsi ja automatiseerimise tööriist",
  tagline: "Analüüsime tegevusi ja töövoogu, mitte inimesi.",
  signIn: "Logi sisse",
  signOut: "Logi välja",
  demoAccounts: "Demokontod (sünteetilised andmed)",
  devLoginDisabled: "Arenduse sisselogimine on keelatud.",
  home: "Avaleht",
  departments: "Osakonnad",
  department: "Osakond",
  welcome: "Tere tulemast",
  role: "Roll",
  roleADMIN: "Organisatsiooni administraator",
  roleMANAGER: "Osakonnajuhataja",
  roleEMPLOYEE: "Töötaja",
  createDepartment: "Loo osakond",
  departmentName: "Osakonna nimi",
  create: "Loo",
  manager: "Juhataja",
  noManager: "Juhatajat pole määratud",
  assignManager: "Määra juhataja",
  members: "Liikmed",
  nextSteps: "Kampaaniad, tegevuste kaardistus ja tegevuspäevik lisanduvad järgmistes etappides.",
  forbidden: "Sul puudub ligipääs sellele lehele.",
};

export const messages: Record<Locale, Record<MessageKey, string>> = { en, et };

export function normalizeLocale(value: string | undefined | null): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : "en";
}

export function translator(locale: Locale) {
  return (key: MessageKey): string => messages[locale][key];
}
