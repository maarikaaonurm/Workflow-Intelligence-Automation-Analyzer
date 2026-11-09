import { describe, expect, it } from "vitest";
import { coverage, observationDates, validateCampaignPeriod, validateEndDateChange, weekdaysBetween } from "./dates";

const period = { startDate: "2026-11-02", endDate: "2026-11-27", reviewWindowDays: 2, retrospectiveWindowDays: 3 };

describe("validateCampaignPeriod", () => {
  it("accepts a valid period", () => {
    expect(validateCampaignPeriod(period)).toEqual([]);
  });

  it("rejects end before start, bad dates and out-of-range windows", () => {
    expect(validateCampaignPeriod({ ...period, endDate: "2026-11-01" })).toContain("errEndBeforeStart");
    expect(validateCampaignPeriod({ ...period, startDate: "2026-02-31" })).toContain("errInvalidDate");
    expect(validateCampaignPeriod({ ...period, reviewWindowDays: 6 })).toContain("errReviewWindowRange");
    expect(validateCampaignPeriod({ ...period, reviewWindowDays: -1 })).toContain("errReviewWindowRange");
    expect(validateCampaignPeriod({ ...period, retrospectiveWindowDays: 15 })).toContain("errRetrospectiveRange");
  });
});

describe("validateEndDateChange", () => {
  const base = { status: "ACTIVE" as const, startDate: "2026-11-02", today: "2026-11-10" };

  it("allows shortening and extending while observation runs", () => {
    expect(validateEndDateChange({ ...base, newEndDate: "2026-11-20" })).toBeNull();
    expect(validateEndDateChange({ ...base, newEndDate: "2026-12-15" })).toBeNull();
  });

  it("rejects ends before the start or in the past", () => {
    expect(validateEndDateChange({ ...base, newEndDate: "2026-11-01" })).toBe("errEndBeforeStart");
    expect(validateEndDateChange({ ...base, newEndDate: "2026-11-05" })).toBe("errEndInPast");
  });

  it("rejects changes once observation has ended or is locked", () => {
    expect(validateEndDateChange({ ...base, status: "REVIEW_WINDOW", newEndDate: "2026-12-15" })).toBe("errEndDateLocked");
    expect(validateEndDateChange({ ...base, status: "LOCKED", newEndDate: "2026-12-15" })).toBe("errEndDateLocked");
  });
});

describe("observation dates and coverage", () => {
  const window = {
    campaignStart: "2026-11-02",
    campaignEnd: "2026-11-13",
    periods: [{ start: "2026-11-02", inactiveFrom: null }],
  };

  it("counts only weekdays", () => {
    expect(weekdaysBetween("2026-11-06", "2026-11-09")).toEqual(["2026-11-06", "2026-11-09"]);
    expect(observationDates(window)).toHaveLength(10);
  });

  it("starts a late participant on their join date", () => {
    expect(observationDates({ ...window, periods: [{ start: "2026-11-09", inactiveFrom: null }] })).toHaveLength(5);
  });

  it("ends on the day before the first inactive day and at the optional upper bound", () => {
    expect(observationDates({ ...window, periods: [{ start: "2026-11-02", inactiveFrom: "2026-11-05" }] })).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(observationDates({ ...window, through: "2026-11-03" })).toHaveLength(2);
  });

  it("does not count absent days as eligible or as missing", () => {
    const result = coverage(window, ["2026-11-05", "2026-11-06"], ["2026-11-02", "2026-11-03", "2026-11-05"]);
    expect(result).toEqual({ eligibleDays: 8, excludedDays: 2, daysWithEntries: 2 });
  });
});
