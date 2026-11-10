import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { ActivityInput } from "@/lib/mapping/schema";

// In-memory stand-in for the Prisma transaction client, covering what the mapping
// service touches. Real constraints (CHECKs, FKs) are exercised on Railway.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const store = vi.hoisted(() => ({
  campaign: {} as Row,
  participant: {} as Row,
  acknowledged: true,
  categoryExists: true,
  activities: [] as Row[],
  audits: [] as Row[],
  nextId: 1,
}));

vi.mock("@/lib/db", () => {
  const latest = (a: Row) => [...a.versions].sort((x, y) => y.versionNumber - x.versionNumber).slice(0, 1);
  const tx = {
    analysisCampaign: { findUnique: async () => store.campaign },
    campaignParticipant: {
      // Only the participant record that belongs to the requested user is found.
      findUnique: async ({ where }: { where: Row }) =>
        store.participant.id && store.participant.userId === where.campaignId_userId?.userId ? { ...store.participant } : null,
      update: async ({ data }: { data: Row }) => Object.assign(store.participant, data),
    },
    campaignAcknowledgement: { findUnique: async () => (store.acknowledged ? { id: "ack" } : null) },
    activityCategory: { findFirst: async () => (store.categoryExists ? { id: "cat1" } : null) },
    volumeUnit: { findFirst: async () => ({ id: "unit1" }) },
    systemReference: { count: async ({ where }: { where: Row }) => where.id.in.length },
    initialActivity: {
      create: async ({ data }: { data: Row }) => {
        const activity = { id: `a${store.nextId++}`, participantId: data.participantId, versions: [] as Row[] };
        activity.versions.push({ id: `v${store.nextId++}`, ...data.versions.create });
        store.activities.push(activity);
        return activity;
      },
      findFirst: async ({ where }: { where: Row }) => {
        const a = store.activities.find((x) => x.id === where.id && x.participantId === where.participantId);
        return a ? { ...a, versions: latest(a) } : null;
      },
      count: async () => store.activities.length,
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.activities.length;
        store.activities = store.activities.filter((x) => !(x.id === where.id && x.participantId === where.participantId));
        return { count: before - store.activities.length };
      },
    },
    initialActivityVersion: {
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const v = store.activities.flatMap((a) => a.versions).find((x) => x.id === where.id)!;
        return Object.assign(v, data);
      },
      create: async ({ data }: { data: Row }) => {
        const a = store.activities.find((x) => x.id === data.activity.connect.id)!;
        const v = { id: `v${store.nextId++}`, ...data };
        a.versions.push(v);
        return v;
      },
      updateMany: async ({ data }: { data: Row }) => {
        for (const v of store.activities.flatMap((a) => a.versions).filter((x) => x.versionNumber === 1)) Object.assign(v, data);
      },
    },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

// syncCampaignStatus is not used by the functions under test
vi.mock("@/lib/services/campaigns", () => ({ syncCampaignStatus: async (c: unknown) => c }));

import { completeMapping, deleteDraftActivity, saveActivity } from "./mapping";

const employee: Actor = { id: "emp", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" };
const otherEmployee: Actor = { id: "emp2", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" };
const adminNoDepartment: Actor = { id: "adm", organizationId: "org", isOrgAdmin: true, departmentRole: null, departmentId: null };
const adminManager: Actor = { id: "am", organizationId: "org", isOrgAdmin: true, departmentRole: "MANAGER", departmentId: "acc" };
const manager: Actor = { id: "mgr", organizationId: "org", isOrgAdmin: false, departmentRole: "MANAGER", departmentId: "acc" };

const input = (overrides: Partial<ActivityInput> = {}): ActivityInput => ({
  name: "Bank receipt review",
  description: "Review receipts",
  purpose: "Match payments",
  outputRecipient: "MANAGER",
  primaryCategoryId: "cat1",
  tags: [],
  frequency: "DAILY",
  occurrenceCount: 1,
  avgDurationMinutes: 30,
  volume: null,
  volumeUnitId: null,
  systemIds: [],
  automationLevel: "MANUAL",
  ruleBasedDegree: "HIGH",
  judgementDegree: "LOW",
  exceptionFrequency: "RARE",
  dataManuallyCopied: false,
  needsInfoFromOthers: false,
  waiting: "NONE",
  rework: "NONE",
  seasonality: "EVEN",
  sensitiveData: ["NONE"],
  improvementOpportunity: false,
  employeeSuggestion: null,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
  store.campaign = {
    id: "c1",
    organizationId: "org",
    departmentId: "acc",
    status: "ACTIVE",
    startDate: new Date("2026-11-09T00:00:00Z"),
    endDate: new Date("2026-11-27T00:00:00Z"),
  };
  store.participant = { id: "p1", campaignId: "c1", userId: "emp", status: "ACTIVE", mappingCompletedAt: null };
  store.acknowledged = true;
  store.categoryExists = true;
  store.activities = [];
  store.audits = [];
  store.nextId = 1;
});
afterEach(() => vi.useRealTimers());

describe("saveActivity", () => {
  it("creates an activity with a first, not-yet-baseline version", async () => {
    await saveActivity(employee, "c1", input());
    expect(store.activities).toHaveLength(1);
    expect(store.activities[0].versions).toHaveLength(1);
    expect(store.activities[0].versions[0]).toMatchObject({ versionNumber: 1, isBaseline: false, name: "Bank receipt review" });
  });

  it("edits the draft version in place before the mapping is completed", async () => {
    const activity = await saveActivity(employee, "c1", input());
    await saveActivity(employee, "c1", input({ avgDurationMinutes: 45 }), activity.id);
    expect(store.activities[0].versions).toHaveLength(1);
    expect(store.activities[0].versions[0].avgDurationMinutes).toBe(45);
  });

  it("adds a new version after completion and never overwrites the baseline", async () => {
    const activity = await saveActivity(employee, "c1", input());
    await completeMapping(employee, "c1");
    expect(store.activities[0].versions[0].isBaseline).toBe(true);

    await saveActivity(employee, "c1", input({ avgDurationMinutes: 60 }), activity.id);
    const versions = store.activities[0].versions;
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ versionNumber: 1, isBaseline: true, avgDurationMinutes: 30 });
    expect(versions[1]).toMatchObject({ versionNumber: 2, isBaseline: false, avgDurationMinutes: 60 });
  });

  it("requires acknowledging About This Analysis first", async () => {
    store.acknowledged = false;
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errAcknowledgeFirst" });
    expect(store.activities).toHaveLength(0);
  });

  it("is forbidden for a non-participant, and for a manager who is not a participant", async () => {
    // The participant row belongs to "emp", so the manager has no participation of their own.
    await expect(saveActivity(manager, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
    store.participant = {};
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is forbidden for an Organization Admin who has no department", async () => {
    await expect(saveActivity(adminNoDepartment, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("does not let an Employee edit another Employee's activity", async () => {
    const activity = await saveActivity(employee, "c1", input());
    store.participant = { id: "p2", campaignId: "c1", userId: "emp2", status: "ACTIVE", mappingCompletedAt: null };
    await expect(saveActivity(otherEmployee, "c1", input({ name: "Hijack" }), activity.id)).rejects.toMatchObject({ code: "errNotFound" });
    expect(store.activities[0].versions[0].name).toBe("Bank receipt review");
  });

  it("is rejected once observation has ended", async () => {
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errCampaignClosed" });
  });

  it("rejects unknown references and invalid content", async () => {
    store.categoryExists = false;
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errUnknownReference" });
    store.categoryExists = true;
    await expect(saveActivity(employee, "c1", input({ sensitiveData: ["NONE", "PERSONAL"] }))).rejects.toThrow();
  });
});

describe("completeMapping and deleteDraftActivity", () => {
  it("needs at least one activity", async () => {
    await expect(completeMapping(employee, "c1")).rejects.toMatchObject({ code: "errNoActivities" });
  });

  it("marks the participant complete, makes version 1 the baseline and audits it", async () => {
    await saveActivity(employee, "c1", input());
    await saveActivity(employee, "c1", input({ name: "Second" }));
    await completeMapping(employee, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
    expect(store.activities.every((a) => a.versions[0].isBaseline)).toBe(true);
    expect(store.audits[0]).toMatchObject({ action: "mapping.completed", metadata: { activityCount: 2 } });
    await expect(completeMapping(employee, "c1")).rejects.toMatchObject({ code: "errMappingCompleted" });
  });

  it("deletes a draft activity but not after completion", async () => {
    const a = await saveActivity(employee, "c1", input());
    const b = await saveActivity(employee, "c1", input({ name: "Second" }));
    await deleteDraftActivity(employee, "c1", a.id);
    expect(store.activities).toHaveLength(1);

    await completeMapping(employee, "c1");
    await expect(deleteDraftActivity(employee, "c1", b.id)).rejects.toMatchObject({ code: "errMappingCompleted" });
    expect(store.activities).toHaveLength(1);
  });
});

describe("a Department Manager (or Organization Admin) who also participates", () => {
  const participating = (userId: string) => {
    store.participant = { id: `p-${userId}`, campaignId: "c1", userId, status: "ACTIVE", mappingCompletedAt: null };
  };

  it("maps their own work like any participant and completes their own baseline", async () => {
    participating("mgr");
    const activity = await saveActivity(manager, "c1", input({ name: "Month-end review" }));
    expect(store.activities[0].participantId).toBe("p-mgr");
    await completeMapping(manager, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
    expect(store.activities[0].versions[0]).toMatchObject({ isBaseline: true, name: "Month-end review" });

    await saveActivity(manager, "c1", input({ avgDurationMinutes: 50 }), activity.id);
    expect(store.activities[0].versions).toHaveLength(2);
  });

  it("works the same for an Organization Admin who is also the Department Manager", async () => {
    participating("am");
    await saveActivity(adminManager, "c1", input());
    await completeMapping(adminManager, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
  });

  it("never lets a manager change another participant's activities", async () => {
    participating("emp");
    const a = await saveActivity(employee, "c1", input());
    participating("mgr");
    await expect(saveActivity(manager, "c1", input({ name: "Hijack" }), a.id)).rejects.toMatchObject({ code: "errNotFound" });
    await expect(deleteDraftActivity(manager, "c1", a.id)).rejects.toMatchObject({ code: "errNotFound" });
  });
});

