import type { ImportReferences } from "./import";

// Shared synthetic fixtures for the mapping and template tests.
export const refs: ImportReferences = {
  categories: [{ id: "cat1", nameEn: "Reconciliation & checks", nameEt: "Täpsustamine ja kontroll" }],
  units: [{ id: "unit1", key: "invoices", nameEn: "Invoices", nameEt: "Arved" }],
  systems: [
    { id: "sys1", name: "ERP" },
    { id: "sys2", name: "Excel" },
  ],
  existing: [{ name: "Bank receipt review", primaryCategoryId: "cat1", description: "Review receipts" }],
};

/** One row in English labels. */
export const recordEn = (): Record<string, string> => ({
  name: "Month-end accrual check",
  description: "Check accruals against the ledger",
  purpose: "Correct month-end figures",
  output_recipient: "Manager",
  output_recipient_note: "",
  primary_category: "Reconciliation & checks",
  tags: "month-end; control",
  frequency: "Monthly",
  occurrence_count: "1",
  avg_duration_minutes: "90",
  volume: "45",
  volume_unit: "Invoices",
  systems: "ERP; Excel",
  automation_level: "Partially automated",
  rule_based_degree: "High",
  judgement_degree: "Low",
  exception_frequency: "Occasional exceptions",
  data_manually_copied: "Yes",
  needs_info_from_others: "No",
  waiting: "None",
  rework: "Sometimes",
  seasonality: "Mainly end of month",
  sensitive_data: "Financial Data",
  improvement_opportunity: "Yes",
  employee_suggestion: "Pull the data automatically",
});

/** The same row in Estonian labels. */
export const recordEt = (): Record<string, string> => ({
  ...recordEn(),
  output_recipient: "Juht",
  primary_category: "Täpsustamine ja kontroll",
  frequency: "Igakuine",
  volume_unit: "Arved",
  automation_level: "Osaliselt automatiseeritud",
  rule_based_degree: "Kõrge",
  judgement_degree: "Madal",
  exception_frequency: "Aeg-ajalt erandeid",
  data_manually_copied: "Jah",
  needs_info_from_others: "Ei",
  waiting: "Puudub",
  rework: "Vahel",
  seasonality: "Peamiselt kuu lõpp",
  sensitive_data: "Finantsandmed",
  improvement_opportunity: "Jah",
});
