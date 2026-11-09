export type CampaignStatus =
  | "DRAFT"
  | "INITIAL_MAPPING"
  | "ACTIVE"
  | "REVIEW_WINDOW"
  | "LOCKED"
  | "ANALYSIS_IN_PROGRESS"
  | "MANAGER_REVIEW"
  | "FINAL"
  | "ARCHIVED"
  | "CANCELLED";

/** Statuses that occupy the department's single active-campaign slot. */
export const OBSERVATION_STATUSES: CampaignStatus[] = ["INITIAL_MAPPING", "ACTIVE", "REVIEW_WINDOW"];

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["INITIAL_MAPPING", "CANCELLED"],
  INITIAL_MAPPING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["REVIEW_WINDOW", "CANCELLED"],
  REVIEW_WINDOW: ["LOCKED", "CANCELLED"],
  // LOCKED/FINAL -> REVIEW_WINDOW is the admin-only reopen path.
  LOCKED: ["REVIEW_WINDOW", "ANALYSIS_IN_PROGRESS", "ARCHIVED"],
  ANALYSIS_IN_PROGRESS: ["MANAGER_REVIEW"],
  MANAGER_REVIEW: ["FINAL"],
  FINAL: ["REVIEW_WINDOW", "ARCHIVED"],
  ARCHIVED: [],
  CANCELLED: [],
};

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Status changes driven purely by the calendar: the observation period starts on
 * the start date and ends after the end date (the Review Window then begins).
 * Returns the status after applying every date-driven step.
 */
export function autoTransition(
  status: CampaignStatus,
  startDate: string,
  endDate: string,
  today: string,
): CampaignStatus {
  let current = status;
  if (current === "INITIAL_MAPPING" && today >= startDate) current = "ACTIVE";
  if (current === "ACTIVE" && today > endDate) current = "REVIEW_WINDOW";
  return current;
}
