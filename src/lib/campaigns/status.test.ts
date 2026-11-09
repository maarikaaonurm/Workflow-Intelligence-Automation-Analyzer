import { describe, expect, it } from "vitest";
import { autoTransition, canTransition } from "./status";

describe("campaign state machine", () => {
  it("allows the forward lifecycle", () => {
    expect(canTransition("DRAFT", "INITIAL_MAPPING")).toBe(true);
    expect(canTransition("INITIAL_MAPPING", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "REVIEW_WINDOW")).toBe(true);
    expect(canTransition("REVIEW_WINDOW", "LOCKED")).toBe(true);
  });

  it("rejects skipping states and leaving terminal states", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "LOCKED")).toBe(false);
    expect(canTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(canTransition("ARCHIVED", "REVIEW_WINDOW")).toBe(false);
  });

  it("only reopens from a locked or final campaign", () => {
    expect(canTransition("LOCKED", "REVIEW_WINDOW")).toBe(true);
    expect(canTransition("FINAL", "REVIEW_WINDOW")).toBe(true);
    expect(canTransition("ACTIVE", "DRAFT")).toBe(false);
  });
});

describe("autoTransition", () => {
  it("starts observation on the start date", () => {
    expect(autoTransition("INITIAL_MAPPING", "2026-11-10", "2026-11-30", "2026-11-09")).toBe("INITIAL_MAPPING");
    expect(autoTransition("INITIAL_MAPPING", "2026-11-10", "2026-11-30", "2026-11-10")).toBe("ACTIVE");
  });

  it("opens the review window only after the end date", () => {
    expect(autoTransition("ACTIVE", "2026-11-10", "2026-11-30", "2026-11-30")).toBe("ACTIVE");
    expect(autoTransition("ACTIVE", "2026-11-10", "2026-11-30", "2026-12-01")).toBe("REVIEW_WINDOW");
  });

  it("applies several steps at once and leaves other statuses alone", () => {
    expect(autoTransition("INITIAL_MAPPING", "2026-11-10", "2026-11-30", "2026-12-05")).toBe("REVIEW_WINDOW");
    expect(autoTransition("DRAFT", "2026-11-10", "2026-11-30", "2026-12-05")).toBe("DRAFT");
    expect(autoTransition("LOCKED", "2026-11-10", "2026-11-30", "2026-12-05")).toBe("LOCKED");
  });
});
