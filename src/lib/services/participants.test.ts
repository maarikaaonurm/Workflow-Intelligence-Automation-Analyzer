import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";

// A minimal in-memory stand-in for the Prisma transaction client, covering only
// what removeParticipant / restoreParticipant touch. Real SQL constraints (the
// one-open-period index) are not exercised here; they run on Railway.
type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  campaign: {} as Row,
  participant: {} as Row,
  periods: [] as Row[],
  audits: [] as Row[],
  membershipActive: true,
}));

vi.mock("@/lib/db", () => {
  const tx = {
    analysisCampaign: { findUnique: async () => store.campaign },
    campaignParticipant: {
      // Return a snapshot, as Prisma does, so later updates do not alter rows already read.
      findFirst: async () => (store.participant.id ? { ...store.participant } : null),
      update: async ({ data }: { data: Row }) => Object.assign(store.participant, data),
      delete: async () => {
        store.participant = {};
      },
    },
    campaignParticipationPeriod: {
      findFirst: async ({ where }: { where: Row }) => {
        const list = store.periods.filter((p) => !("inactiveFrom" in where) || p.inactiveFrom === where.inactiveFrom);
        return list.length ? list[list.length - 1] : null;
      },
      update: async ({ data }: { data: Row }) => {
        const open = store.periods.find((p) => p.inactiveFrom === null)!;
        return Object.assign(open, data);
      },
      create: async ({ data }: { data: Row }) => {
        if (store.periods.some((p) => p.inactiveFrom === null)) throw new Error("open period exists");
        const row = { inactiveFrom: null, endMode: null, startedAt: new Date(), ...data };
        store.periods.push(row);
        return row;
      },
    },
    departmentMembership: { findFirst: async () => (store.membershipActive ? { id: "m" } : null) },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { removeParticipant, restoreParticipant } from "./campaigns";

const manager: Actor = { id: "mgr", organizationId: "org", isOrgAdmin: false, departmentRole: "MANAGER", departmentId: "acc" };
const otherManager: Actor = { id: "mgr2", organizationId: "org", isOrgAdmin: false, departmentRole: "MANAGER", departmentId: "hr" };
const employee: Actor = { id: "emp", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" };
const admin: Actor = { id: "adm", organizationId: "org", isOrgAdmin: true, departmentRole: null, departmentId: null };

function setup(campaignStatus: string, participantStatus: string, periods: Row[]) {
  store.campaign = {
    id: "c1",
    organizationId: "org",
    departmentId: "acc",
    status: campaignStatus,
    startDate: new Date("2026-11-09T00:00:00Z"),
  };
  store.participant = { id: "p1", campaignId: "c1", userId: "u1", status: participantStatus };
  store.periods = periods;
  store.audits = [];
  store.membershipActive = true;
}

const stoppedPeriod = (): Row => ({
  startDate: new Date("2026-11-09T00:00:00Z"),
  inactiveFrom: new Date("2026-11-16T00:00:00Z"),
  endMode: "STOP_KEEP_DATA",
  startedKind: "INITIAL",
  startedAt: new Date(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("restoreParticipant", () => {
  it("opens a new period from the restoration date and keeps the earlier one", async () => {
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    await restoreParticipant(manager, "c1", "p1");

    expect(store.periods).toHaveLength(2);
    expect(store.periods[0]).toMatchObject({ endMode: "STOP_KEEP_DATA" });
    expect((store.periods[0].inactiveFrom as Date).toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(store.periods[1]).toMatchObject({ startedKind: "RESTORED", startedById: "mgr", inactiveFrom: null });
    expect((store.periods[1].startDate as Date).toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(store.participant).toMatchObject({ status: "ACTIVE", removedAt: null, removedById: null });
  });

  it("restores an excluded participant and audits the previous mode", async () => {
    const excluded = { ...stoppedPeriod(), endMode: "EXCLUDE_DATA" };
    setup("INITIAL_MAPPING", "EXCLUDED", [excluded]);
    await restoreParticipant(manager, "c1", "p1");

    expect(store.participant.status).toBe("ACTIVE");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      action: "campaign.participantRestored",
      actorId: "mgr",
      metadata: { previousStatus: "EXCLUDED", previousMode: "EXCLUDE_DATA", restoredFrom: "2026-11-20", previousInactiveFrom: "2026-11-16" },
    });
  });

  it("is allowed during the review window", async () => {
    setup("REVIEW_WINDOW", "STOPPED", [stoppedPeriod()]);
    await expect(restoreParticipant(manager, "c1", "p1")).resolves.toBeUndefined();
  });

  it.each(["LOCKED", "FINAL", "ARCHIVED", "CANCELLED"])("is rejected when the campaign is %s", async (status) => {
    setup(status, "STOPPED", [stoppedPeriod()]);
    await expect(restoreParticipant(manager, "c1", "p1")).rejects.toMatchObject({ code: "errCampaignClosed" });
    expect(store.periods).toHaveLength(1);
    expect(store.audits).toHaveLength(0);
  });

  it("is rejected for a participant who is already active", async () => {
    setup("ACTIVE", "ACTIVE", [{ startDate: new Date("2026-11-09T00:00:00Z"), inactiveFrom: null, endMode: null }]);
    await expect(restoreParticipant(manager, "c1", "p1")).rejects.toMatchObject({ code: "errNotRemoved" });
  });

  it("is rejected when the user is no longer an active department Employee", async () => {
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    store.membershipActive = false;
    await expect(restoreParticipant(manager, "c1", "p1")).rejects.toMatchObject({ code: "errNotDepartmentEmployee" });
  });

  it.each([
    ["an Employee", employee],
    ["another department's manager", otherManager],
    ["the Organization Admin", admin],
  ])("is forbidden for %s", async (_label, actor) => {
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    await expect(restoreParticipant(actor, "c1", "p1")).rejects.toMatchObject({ code: "errForbidden" });
    expect(store.periods).toHaveLength(1);
    expect(store.participant.status).toBe("STOPPED");
  });
});

describe("removeParticipant", () => {
  const open = (): Row => ({
    startDate: new Date("2026-11-09T00:00:00Z"),
    inactiveFrom: null,
    endMode: null,
    startedKind: "INITIAL",
  });

  it("closes the open period with the removal mode instead of deleting anything", async () => {
    setup("ACTIVE", "ACTIVE", [open()]);
    await removeParticipant(manager, "c1", "p1", "EXCLUDE_DATA");

    expect(store.periods).toHaveLength(1);
    expect(store.periods[0]).toMatchObject({ endMode: "EXCLUDE_DATA", endedById: "mgr" });
    expect((store.periods[0].inactiveFrom as Date).toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(store.participant).toMatchObject({ status: "EXCLUDED", removedById: "mgr" });
    expect(store.audits[0]).toMatchObject({ action: "campaign.participantRemoved", metadata: { mode: "EXCLUDE_DATA" } });
  });

  it("supports stop-and-keep-data", async () => {
    setup("ACTIVE", "ACTIVE", [open()]);
    await removeParticipant(manager, "c1", "p1", "STOP_KEEP_DATA");
    expect(store.participant.status).toBe("STOPPED");
  });

  it("rejects removing a participant who is already removed", async () => {
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    await expect(removeParticipant(manager, "c1", "p1", "STOP_KEEP_DATA")).rejects.toMatchObject({ code: "errAlreadyRemoved" });
  });

  it("is forbidden for other departments' managers and rejected after locking", async () => {
    setup("ACTIVE", "ACTIVE", [open()]);
    await expect(removeParticipant(otherManager, "c1", "p1", "STOP_KEEP_DATA")).rejects.toMatchObject({ code: "errForbidden" });
    setup("LOCKED", "ACTIVE", [open()]);
    await expect(removeParticipant(manager, "c1", "p1", "STOP_KEEP_DATA")).rejects.toMatchObject({ code: "errCampaignClosed" });
  });

  it("can be followed by a restoration, leaving two periods with the gap preserved", async () => {
    setup("ACTIVE", "ACTIVE", [open()]);
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
    await removeParticipant(manager, "c1", "p1", "STOP_KEEP_DATA");
    vi.setSystemTime(new Date("2026-11-20T09:00:00Z"));
    await restoreParticipant(manager, "c1", "p1");

    const days = store.periods.map((p) => [
      (p.startDate as Date).toISOString().slice(0, 10),
      p.inactiveFrom ? (p.inactiveFrom as Date).toISOString().slice(0, 10) : null,
    ]);
    expect(days).toEqual([
      ["2026-11-09", "2026-11-16"],
      ["2026-11-20", null],
    ]);
    expect(store.audits.map((a) => a.action)).toEqual(["campaign.participantRemoved", "campaign.participantRestored"]);
  });
});

describe("a Department Manager who is also a participant", () => {
  it("keeps the manager functions: can stop and restore their own participation", async () => {
    setup("ACTIVE", "ACTIVE", [
      { startDate: new Date("2026-11-09T00:00:00Z"), inactiveFrom: null, endMode: null, startedKind: "INITIAL" },
    ]);
    store.participant.userId = "mgr"; // the manager's own participant record
    await removeParticipant(manager, "c1", "p1", "STOP_KEEP_DATA");
    expect(store.participant.status).toBe("STOPPED");
    await restoreParticipant(manager, "c1", "p1");
    expect(store.participant.status).toBe("ACTIVE");
    expect(store.periods).toHaveLength(2);
  });

  it("is managed like any participant by an Organization Admin who is also that department's manager", async () => {
    const adminManager: Actor = { id: "am", organizationId: "org", isOrgAdmin: true, departmentRole: "MANAGER", departmentId: "acc" };
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    await restoreParticipant(adminManager, "c1", "p1");
    expect(store.participant.status).toBe("ACTIVE");
  });

  it("is not manageable by an Organization Admin with no department", async () => {
    const admin2: Actor = { id: "adm", organizationId: "org", isOrgAdmin: true, departmentRole: null, departmentId: null };
    setup("ACTIVE", "STOPPED", [stoppedPeriod()]);
    await expect(restoreParticipant(admin2, "c1", "p1")).rejects.toMatchObject({ code: "errForbidden" });
  });
});

