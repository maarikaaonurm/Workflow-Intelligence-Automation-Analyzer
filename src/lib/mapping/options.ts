// Enumerations shared by the form, the import and validation. They mirror the Prisma enums.
export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "AD_HOC"] as const;
export const OUTPUT_RECIPIENTS = [
  "MANAGER",
  "OTHER_DEPARTMENT",
  "CUSTOMER",
  "AUTHORITY",
  "EXTERNAL_PARTY",
  "SYSTEM",
  "SELF",
  "UNKNOWN",
  "OTHER",
] as const;
export const AUTOMATION_LEVELS = ["MANUAL", "PARTIAL", "AUTOMATED"] as const;
export const DEGREES = ["LOW", "MEDIUM", "HIGH"] as const;
export const EXCEPTION_FREQUENCIES = ["RARE", "OCCASIONAL", "FREQUENT", "ALMOST_EVERY_CASE", "NOT_SURE"] as const;
export const OCCURRENCE_LEVELS = ["NONE", "SOMETIMES", "OFTEN"] as const;
export const SEASONALITIES = ["EVEN", "START_OF_MONTH", "END_OF_MONTH", "QUARTER_END", "YEAR_END", "OTHER"] as const;
export const SENSITIVE_CATEGORIES = ["PERSONAL", "HEALTH", "FINANCIAL", "CONFIDENTIAL", "CREDENTIALS", "OTHER", "NONE"] as const;
