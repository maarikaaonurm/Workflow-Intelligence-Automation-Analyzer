import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  participants: [] as Row[],
  activityCounts: [] as { participantId: string; _count: { _all: number } }[],
  campaignCreateCalls: 0,
}));

const DONE = new Date("2026-11-12T09:00:00Z");

vi.mock("@/lib/db", () => {
  const tx = {
    analysisCampaign: {
      findUnique: async () => ({
        id: "c1", organizationId: "org", departmentId: "acc", name: "Nov", status: "ACTIVE",
        startDate: new Date("2026-11-09T00:00:00Z"), endDate: new Date("2026-11-27T00:00:00Z"),
        department: { id: "acc", name: "Accounting" },
      }),
      findFirst: async () => ({ id: "existing" }),
      create: async () => {
        store.campaignCreateCalls++;
        return { id: "new" };
      },
    },
    campaignParticipant: {
      findMany: async () => store.participants,
      findUnique: async ({ where }: { where: Row }) => store.participants.find((p) => p.userId === where.campaignId_userId.userId) ?? null,
    },
    campaignAcknowledgement: { count: async () => 1, findUnique: async () => null },
    auditLog: { findMany: async () => [] },
    reminderPreference: { findUnique: async () => null },
    initialActivity: { groupBy: async () => store.activityCounts },
    departmentMembership: { findMany: async () => [], findFirst: async () => ({ id: "m" }) },
    department: { findFirst: async () => ({ id: "dept", organizationId: "org" }), create: async () => ({ id: "dept" }) },
    user: { upsert: async ({ where }: { where: Row }) => ({ id: where.email, email: where.email }) },
    activityCategory: { findFirst: async () => ({ id: "x", definitionEt: "d", belongsHereEt: "b", notBelongsHereEt: "n" }), create: async () => ({}), update: async () => ({}) },
    volumeUnit: { upsert: async () => ({}) },
    systemReference: { upsert: async () => ({}) },
  };
  return { db: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { getCampaignDetail } from "./campaigns";
import { ensureMappingDemoData } from "@/lib/demo/mapping-demo";

const actor = (id: string, isOrgAdmin: boolean, departmentRole: Actor["departmentRole"], departmentId: string | null): Actor => ({
  id, organizationId: "org", isOrgAdmin, departmentRole, departmentId,
});
const manager = actor("mgr", false, "MANAGER", "acc");
const employee = actor("emp", false, "EMPLOYEE", "acc");
const adminManager = actor("am", true, "MANAGER", "acc");

const participant = (id: string, userId: string, name: string, extra: Row = {}): Row => ({
  id, userId, campaignId: "c1", status: "ACTIVE", mappingCompletedAt: null,
  user: { id: userId, name }, excludedDates: [], periods: [], ...extra,
});

beforeEach(() => {
  store.campaignCreateCalls = 0;
  store.participants = [
    participant("p-mgr", "mgr", "Marta Manager"),
    participant("p1", "emp", "Eha Done", { mappingCompletedAt: DONE }),
    participant("p2", "u2", "Jüri Draft"),
    participant("p3", "u3", "Tiiu None"),
    participant("p4", "u4", "Stopped Sam", { status: "STOPPED" }),
  ];
  store.activityCounts = [
    { participantId: "p1", _count: { _all: 4 } },
    { participantId: "p2", _count: { _all: 2 } },
    { participantId: "p4", _count: { _all: 1 } },
  ];
});

describe("manager readiness view", () => {
  it("shows each active participant's neutral status and completion date, and the X of Y count", async () => {
    const detail = await getCampaignDetail(manager, "c1");
    const byName = Object.fromEntries(detail.mappingReadiness.map((r) => [r.name, r]));
    expect(byName["Eha Done"]).toMatchObject({ status: "COMPLETED", completedAt: DONE });
    expect(byName["Jüri Draft"]).toMatchObject({ status: "DRAFT", completedAt: null });
    expect(byName["Tiiu None"]).toMatchObject({ status: "NOT_STARTED" });
    expect(byName["Marta Manager"]).toMatchObject({ status: "NOT_STARTED" });
    expect(detail.mappingReadiness.map((r) => r.name)).not.toContain("Stopped Sam");
    expect(detail.mappingCompletedCount).toBe(1);
    expect(detail.participantCount).toBe(4);
  });

  it("carries no score, rank or comparison, and exposes no activity content", async () => {
    const detail = await getCampaignDetail(manager, "c1");
    for (const row of detail.mappingReadiness) {
      expect(Object.keys(row).sort()).toEqual(["completedAt", "name", "participantId", "status"]);
    }
  });

  it("is not shown to an Employee, who sees no other participant", async () => {
    const detail = await getCampaignDetail(employee, "c1");
    expect(detail.mappingReadiness).toEqual([]);
    expect(detail.participants).toEqual([]);
    expect(detail.canManage).toBe(false);
  });

  it("lets a manager who participates see both the readiness view and their own participant area", async () => {
    const detail = await getCampaignDetail(manager, "c1");
    expect(detail.canManage).toBe(true);
    expect(detail.mappingReadiness.length).toBeGreaterThan(0);
    expect(detail.own?.participant).toMatchObject({ userId: "mgr" });
    const both = await getCampaignDetail(adminManager, "c1");
    expect(both.canManage).toBe(true);
    expect(both.canReopen).toBe(true);
  });

  it("gives a manager who does not participate the readiness view but no participant area", async () => {
    store.participants = store.participants.filter((p) => p.userId !== "mgr");
    const detail = await getCampaignDetail(manager, "c1");
    expect(detail.canManage).toBe(true);
    expect(detail.own).toBeNull();
  });
});

describe("synthetic demo data", () => {
  it("only an Organization Admin can load it", async () => {
    await expect(ensureMappingDemoData(manager)).rejects.toMatchObject({ code: "errForbidden" });
    await expect(ensureMappingDemoData(employee)).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is idempotent: it never adds a second campaign to a department that already has one", async () => {
    const admin = actor("adm", true, null, null);
    await expect(ensureMappingDemoData(admin)).resolves.toEqual({ created: false });
    await expect(ensureMappingDemoData(admin)).resolves.toEqual({ created: false });
    expect(store.campaignCreateCalls).toBe(0);
  });
});
