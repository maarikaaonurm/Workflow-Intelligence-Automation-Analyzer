import { describe, expect, it } from "vitest";
import { coverage, observationDates } from "./dates";
import {
  analysisPeriods,
  canRemoveParticipant,
  canRestoreParticipant,
  effectiveDate,
  isActiveOn,
} from "./participation";

// Active 11-09..11-15, stopped 11-16..11-19, restored 11-20 (campaign 11-09..11-27)
const window = {
  campaignStart: "2026-11-09",
  campaignEnd: "2026-11-27",
  periods: [
    { start: "2026-11-09", inactiveFrom: "2026-11-16" },
    { start: "2026-11-20", inactiveFrom: null },
  ],
};

describe("restoration eligibility", () => {
  it("allows restoring stopped or excluded participants while the campaign is editable", () => {
    for (const campaign of ["INITIAL_MAPPING", "ACTIVE", "REVIEW_WINDOW"] as const) {
      expect(canRestoreParticipant(campaign, "STOPPED")).toBe(true);
      expect(canRestoreParticipant(campaign, "EXCLUDED")).toBe(true);
    }
  });

  it("never allows restoring after the data is locked, or for an active participant", () => {
    for (const campaign of ["LOCKED", "ANALYSIS_IN_PROGRESS", "MANAGER_REVIEW", "FINAL", "ARCHIVED", "CANCELLED", "DRAFT"] as const) {
      expect(canRestoreParticipant(campaign, "STOPPED")).toBe(false);
    }
    expect(canRestoreParticipant("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("only removes active participants", () => {
    expect(canRemoveParticipant("ACTIVE", "ACTIVE")).toBe(true);
    expect(canRemoveParticipant("ACTIVE", "STOPPED")).toBe(false);
    expect(canRemoveParticipant("LOCKED", "ACTIVE")).toBe(false);
  });
});

describe("effective date", () => {
  it("is today once the campaign has started, and the start date before that", () => {
    expect(effectiveDate("2026-11-09", "2026-11-20")).toBe("2026-11-20");
    expect(effectiveDate("2026-11-09", "2026-11-02")).toBe("2026-11-09");
  });
});

describe("multiple participation periods", () => {
  it("does not count the inactive gap as observation days", () => {
    const dates = observationDates(window);
    expect(dates).toContain("2026-11-13");
    expect(dates).not.toContain("2026-11-16");
    expect(dates).not.toContain("2026-11-19");
    expect(dates).toContain("2026-11-20");
    // 11-09..11-13 (5) + 11-20, 11-23..11-27 (6)
    expect(dates).toHaveLength(11);
  });

  it("does not report the gap as missing logging days", () => {
    const result = coverage(window, [], ["2026-11-09", "2026-11-10", "2026-11-20"]);
    expect(result).toEqual({ eligibleDays: 11, excludedDays: 0, daysWithEntries: 3 });
  });

  it("still honours absent days across periods", () => {
    const result = coverage(window, ["2026-11-12", "2026-11-24"], []);
    expect(result.eligibleDays).toBe(9);
    expect(result.excludedDays).toBe(2);
  });

  it("ignores an absent date that falls in the inactive gap", () => {
    const result = coverage(window, ["2026-11-17"], []);
    expect(result).toEqual({ eligibleDays: 11, excludedDays: 0, daysWithEntries: 0 });
  });

  it("handles a zero-length period (removed on the day it started)", () => {
    const dates = observationDates({
      campaignStart: "2026-11-09",
      campaignEnd: "2026-11-13",
      periods: [{ start: "2026-11-11", inactiveFrom: "2026-11-11" }],
    });
    expect(dates).toEqual([]);
  });

  it("respects the upper bound for preliminary analysis", () => {
    expect(observationDates({ ...window, through: "2026-11-20" })).toHaveLength(6);
  });
});

describe("final analysis inclusion", () => {
  it("leaves out an excluded participant and includes active periods again after restoration", () => {
    expect(analysisPeriods("EXCLUDED", window.periods)).toEqual([]);
    expect(analysisPeriods("ACTIVE", window.periods)).toEqual(window.periods);
    expect(analysisPeriods("STOPPED", window.periods)).toEqual(window.periods);
  });

  it("identifies data dates inside and outside active periods", () => {
    expect(isActiveOn("2026-11-12", window.periods)).toBe(true);
    expect(isActiveOn("2026-11-16", window.periods)).toBe(false);
    expect(isActiveOn("2026-11-20", window.periods)).toBe(true);
  });
});
