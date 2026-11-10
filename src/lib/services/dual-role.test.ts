import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
// "About This Analysis" acknowledgement for people who hold more than one capability.
type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  campaign: {} as Row,
  participants: [] as Row[],
  acknowledgements: [] as Row[],
  audits: [] as Row[],
}));

vi.mock("@/lib/db", () => {
  const tx = {
    analysisCampaign: { findUnique: async () => store.campaign },
    campaignParticipant: {
      findUnique: async ({ where }: { where: Row }) =>
        store.participants.find((p) => p.campaignId === where.campaignId_userId.campaignId && p.userId === where.campaignId_userId.userId) ?? null,
    },
    campaignAcknowledgement: {
      upsert: async ({ create }: { create: Row }) => {
        if (!store.acknowledgements.some((a) => a.userId === create.userId)) store.acknowledgements.push(create);
      },
    },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  return { db: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { acknowledgeAbout } from "./campaigns";

const actor = (id: string, isOrgAdmin: boolean, departmentRole: Actor["departmentRole"], departmentId: string | null): Actor => ({
  id,
  organizationId: "org",
  isOrgAdmin,
  departmentRole,
  departmentId,
});

const employee = actor("emp", false, "EMPLOYEE", "acc");
const manager = actor("mgr", false, "MANAGER", "acc");
const adminManager = actor("am", true, "MANAGER", "acc");
const adminEmployee = actor("ae", true, "EMPLOYEE", "acc");
const adminNoDepartment = actor("adm", true, null, null);

beforeEach(() => {
  store.campaign = { id: "c1", organizationId: "org", departmentId: "acc", status: "ACTIVE" };
  store.participants = ["emp", "mgr", "am", "ae"].map((userId) => ({ campaignId: "c1", userId, status: "ACTIVE" }));
  store.acknowledgements = [];
  store.audits = [];
});

describe("About This Analysis acknowledgement", () => {
  it("is available to an Employee, a Department Manager and an Organization Admin who is a participant", async () => {
    for (const a of [employee, manager, adminManager, adminEmployee]) await acknowledgeAbout(a, "c1");
    expect(store.acknowledgements.map((x) => x.userId).sort()).toEqual(["ae", "am", "emp", "mgr"]);
  });

  it("is recorded for the signed-in user's own participant record only", async () => {
    await acknowledgeAbout(manager, "c1");
    expect(store.acknowledgements).toHaveLength(1);
    expect(store.acknowledgements[0]).toMatchObject({ campaignId: "c1", userId: "mgr" });
    expect(store.audits[0]).toMatchObject({ action: "campaign.acknowledged", actorId: "mgr" });
  });

  it("is refused for a Department Manager who is not a participant of the campaign", async () => {
    store.participants = store.participants.filter((p) => p.userId !== "mgr");
    await expect(acknowledgeAbout(manager, "c1")).rejects.toMatchObject({ code: "errForbidden" });
    expect(store.acknowledgements).toHaveLength(0);
  });

  it("is refused for a participant who was stopped", async () => {
    store.participants.find((p) => p.userId === "mgr")!.status = "STOPPED";
    await expect(acknowledgeAbout(manager, "c1")).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is not granted by the Organization Admin privilege alone", async () => {
    await expect(acknowledgeAbout(adminNoDepartment, "c1")).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is not available for another department's campaign, even to an Organization Admin who manages a different one", async () => {
    store.campaign = { id: "c2", organizationId: "org", departmentId: "hr", status: "ACTIVE" };
    store.participants.push({ campaignId: "c2", userId: "am", status: "ACTIVE" });
    await expect(acknowledgeAbout(adminManager, "c2")).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is closed once the campaign no longer collects data", async () => {
    store.campaign.status = "LOCKED";
    await expect(acknowledgeAbout(manager, "c1")).rejects.toMatchObject({ code: "errCampaignClosed" });
  });
});
