import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
// In-memory stand-in for the Prisma client. It enforces the same two partial unique
// indexes as the migration (one active membership per user, one active manager per
// department), so the order of operations in the service is genuinely exercised.
type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  users: [] as Row[],
  departments: [] as Row[],
  memberships: [] as Row[],
  participants: [] as Row[],
  createdParticipants: [] as Row[],
  audits: [] as Row[],
  nextId: 1,
}));

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("not" in cond) return value !== cond.not;
      if ("in" in cond) return (cond.in as unknown[]).includes(value);
      return value != null && matches(value, cond);
    }
    return value === cond;
  });
}

function assertInvariants() {
  const active = store.memberships.filter((m) => m.active);
  const perUser = new Set<string>();
  const managers = new Set<string>();
  for (const m of active) {
    if (perUser.has(m.userId)) throw new Error("unique violation: one active membership per user");
    perUser.add(m.userId);
    if (m.role === "MANAGER") {
      if (managers.has(m.departmentId)) throw new Error("unique violation: one active manager per department");
      managers.add(m.departmentId);
    }
  }
}

vi.mock("@/lib/db", () => {
  const withUser = (m: Row) => ({ ...m, user: store.users.find((u) => u.id === m.userId) });
  const tx = {
    user: {
      // Rows are returned as snapshots, as Prisma does, so later updates do not alter rows already read.
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const u = store.users.find((x) => matches(x, where));
        if (!u) return null;
        const copy: Row = { ...u };
        if (include?.memberships) {
          copy.memberships = store.memberships
            .filter((m) => m.userId === u.id && m.active)
            .map((m) => ({ ...m, department: store.departments.find((d) => d.id === m.departmentId) }));
        }
        return copy;
      },
      findUnique: async ({ where }: { where: Row }) => {
        const u = store.users.find((x) => matches(x, where));
        return u ? { ...u } : null;
      },
      findMany: async ({ where }: { where: Row }) =>
        store.users
          .filter((u) => matches(u, where))
          .map((u) => ({ ...u, memberships: store.memberships.filter((m) => m.userId === u.id && m.active) })),
      create: async ({ data }: { data: Row }) => {
        const user = { id: `u${store.nextId++}`, active: true, isOrgAdmin: false, ...data };
        store.users.push(user);
        return user;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const user = store.users.find((u) => u.id === where.id)!;
        return Object.assign(user, data);
      },
    },
    department: {
      findFirst: async ({ where }: { where: Row }) => store.departments.find((d) => matches(d, where)) ?? null,
      findUnique: async ({ where }: { where: Row }) => store.departments.find((d) => matches(d, where)) ?? null,
    },
    departmentMembership: {
      findFirst: async ({ where }: { where: Row }) => store.memberships.map(withUser).find((m) => matches(m, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => store.memberships.map(withUser).filter((m) => matches(m, where)),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `m${store.nextId++}`, active: true, endedAt: null, ...data };
        store.memberships.push(row);
        try {
          assertInvariants();
        } catch (e) {
          store.memberships.pop();
          throw e;
        }
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.memberships.find((m) => m.id === where.id)!;
        const before = { ...row };
        Object.assign(row, data);
        try {
          assertInvariants();
        } catch (e) {
          Object.assign(row, before);
          throw e;
        }
        return row;
      },
    },
    campaignParticipant: {
      findMany: async ({ where }: { where: Row }) => store.participants.filter((p) => matches(p, where)),
      create: async ({ data }: { data: Row }) => {
        store.createdParticipants.push(data);
        return data;
      },
    },
    analysisCampaign: {
      create: async ({ data }: { data: Row }) => ({ id: "newCampaign", ...data }),
    },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  return { db: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { createCampaign } from "./campaigns";
import { assignManager } from "./departments";
import {
  createUser,
  deactivateUser,
  getMembershipChangePreview,
  listAssignableUsers,
  listUsers,
  reactivateUser,
  setUserMembership,
  updateUser,
} from "./users";
import { groupCandidates } from "@/lib/membership/candidates";

const admin: Actor = { id: "admin", organizationId: "org", isOrgAdmin: true, departmentRole: null, departmentId: null };
const manager: Actor = { id: "mgr", organizationId: "org", isOrgAdmin: false, departmentRole: "MANAGER", departmentId: "acc" };
const employee: Actor = { id: "emp", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" };

const person = (id: string, first: string, extra: Row = {}): Row => ({
  id,
  organizationId: "org",
  email: `${first.toLowerCase()}@demo.example`,
  firstName: first,
  lastName: "Test",
  name: `${first} Test`,
  active: true,
  isOrgAdmin: false,
  ...extra,
});
const membership = (id: string, userId: string, departmentId: string, role: string, extra: Row = {}): Row => ({
  id,
  userId,
  departmentId,
  role,
  active: true,
  startedAt: new Date("2026-10-01T00:00:00Z"),
  endedAt: null,
  ...extra,
});
const activeMemberships = (userId: string) => store.memberships.filter((m) => m.userId === userId && m.active);
const actions = () => store.audits.map((a) => a.action);

beforeEach(() => {
  store.nextId = 100;
  store.audits = [];
  store.createdParticipants = [];
  store.departments = [
    { id: "acc", organizationId: "org", name: "Accounting" },
    { id: "cm", organizationId: "org", name: "Credit Management" },
    { id: "new", organizationId: "org", name: "New department" },
  ];
  store.users = [
    person("admin", "Admin", { isOrgAdmin: true }),
    person("mgr", "Marta"),
    person("emp", "Jaan"),
    person("emp2", "Liis"),
    person("cmmgr", "Rain"),
  ];
  store.memberships = [
    membership("m1", "mgr", "acc", "MANAGER"),
    membership("m2", "emp", "acc", "EMPLOYEE"),
    membership("m3", "emp2", "acc", "EMPLOYEE"),
    membership("m4", "cmmgr", "cm", "MANAGER"),
  ];
  store.participants = [];
});

describe("creating and editing users", () => {
  it("creates a user with a department and role, and audits both", async () => {
    const user = await createUser(admin, { firstName: "Kati", lastName: "Rebane", email: "Kati.Rebane@demo.example" }, { departmentId: "acc", role: "EMPLOYEE" });
    expect(user).toMatchObject({ firstName: "Kati", lastName: "Rebane", name: "Kati Rebane", email: "kati.rebane@demo.example", active: true });
    expect(activeMemberships(user.id)).toHaveLength(1);
    expect(activeMemberships(user.id)[0]).toMatchObject({ departmentId: "acc", role: "EMPLOYEE" });
    expect(actions()).toEqual(["user.created", "user.departmentAssigned"]);
  });

  it("rejects a duplicate email and invalid input", async () => {
    await expect(createUser(admin, { firstName: "X", lastName: "Y", email: "JAAN@demo.example" }, { departmentId: "acc", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errEmailTaken" });
    await expect(createUser(admin, { firstName: "", lastName: "Y", email: "a@b.example" }, { departmentId: "acc", role: "EMPLOYEE" })).rejects.toThrow();
    expect(store.users).toHaveLength(5);
  });

  it("edits basic details, keeps the display name in sync and audits field names only", async () => {
    await updateUser(admin, "emp", { firstName: "Jaan", lastName: "Uus", email: "jaan@demo.example" });
    expect(store.users.find((u) => u.id === "emp")).toMatchObject({ lastName: "Uus", name: "Jaan Uus" });
    expect(store.audits[0]).toMatchObject({ action: "user.updated", metadata: { changed: ["lastName"] } });
    await expect(updateUser(admin, "emp", { firstName: "Jaan", lastName: "Uus", email: "liis@demo.example" })).rejects.toMatchObject({ code: "errEmailTaken" });
  });
});

describe("authorization", () => {
  it("allows only the Organization Admin to manage users, memberships and managers", async () => {
    for (const actor of [manager, employee]) {
      await expect(createUser(actor, { firstName: "A", lastName: "B", email: "a@b.example" }, { departmentId: "acc", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errForbidden" });
      await expect(setUserMembership(actor, "emp", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errForbidden" });
      await expect(deactivateUser(actor, "emp")).rejects.toMatchObject({ code: "errForbidden" });
      await expect(assignManager(actor, "acc", "emp")).rejects.toMatchObject({ code: "errForbidden" });
      await expect(listUsers(actor)).rejects.toMatchObject({ code: "errForbidden" });
    }
    expect(store.audits).toHaveLength(0);
  });

  it("does not manage users of another organization", async () => {
    store.users.push(person("foreign", "Fred", { organizationId: "other" }));
    await expect(deactivateUser(admin, "foreign")).rejects.toMatchObject({ code: "errNotFound" });
  });
});

describe("department membership and history", () => {
  it("moves a user to another department by ending the old membership and starting a new one", async () => {
    await setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" });
    const history = store.memberships.filter((m) => m.userId === "emp");
    expect(history).toHaveLength(2);
    expect(history.find((m) => m.departmentId === "acc")).toMatchObject({ active: false, role: "EMPLOYEE" });
    expect(history.find((m) => m.departmentId === "acc")!.endedAt).toBeInstanceOf(Date);
    expect(activeMemberships("emp")).toHaveLength(1);
    expect(activeMemberships("emp")[0].departmentId).toBe("cm");
    expect(store.audits[0]).toMatchObject({
      action: "user.departmentChanged",
      metadata: { fromDepartmentId: "acc", toDepartmentId: "cm" },
    });
  });

  it("records a role change within a department as a new membership period", async () => {
    await setUserMembership(admin, "emp", { departmentId: "acc", role: "MANAGER" });
    expect(store.memberships.filter((m) => m.userId === "emp")).toHaveLength(2);
    expect(store.audits.map((a) => a.action)).toContain("user.roleChanged");
  });

  it("does nothing when nothing changes", async () => {
    expect(await setUserMembership(admin, "emp", { departmentId: "acc", role: "EMPLOYEE" })).toEqual({ changed: false });
    expect(store.memberships).toHaveLength(4);
    expect(store.audits).toHaveLength(0);
  });

  it("lets an Organization Admin hold one department membership, as Employee or Department Manager", async () => {
    await setUserMembership(admin, "admin", { departmentId: "acc", role: "EMPLOYEE" });
    expect(activeMemberships("admin")).toHaveLength(1);
    expect(store.users.find((u) => u.id === "admin")).toMatchObject({ isOrgAdmin: true });

    await setUserMembership(admin, "admin", { departmentId: "acc", role: "MANAGER" });
    expect(activeMemberships("admin")[0]).toMatchObject({ departmentId: "acc", role: "MANAGER" });
    // The previous manager stayed in the department as an Employee; still exactly one manager.
    expect(activeMemberships("mgr")[0]).toMatchObject({ departmentId: "acc", role: "EMPLOYEE" });
    expect(store.memberships.filter((m) => m.departmentId === "acc" && m.active && m.role === "MANAGER")).toHaveLength(1);
    // The admin privilege and the membership history are untouched by each other.
    expect(store.memberships.filter((m) => m.userId === "admin")).toHaveLength(2);
  });

  it("still allows only one active membership for an Organization Admin", async () => {
    await setUserMembership(admin, "admin", { departmentId: "acc", role: "EMPLOYEE" });
    await setUserMembership(admin, "admin", { departmentId: "cm", role: "EMPLOYEE" });
    expect(activeMemberships("admin")).toHaveLength(1);
    expect(activeMemberships("admin")[0].departmentId).toBe("cm");
  });

  it("keeps exactly one active membership per user across a series of changes", async () => {
    await setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" });
    await setUserMembership(admin, "emp", { departmentId: "acc", role: "EMPLOYEE" });
    await setUserMembership(admin, "emp", { departmentId: "new", role: "MANAGER" });
    expect(activeMemberships("emp")).toHaveLength(1);
    expect(store.memberships.filter((m) => m.userId === "emp")).toHaveLength(4);
  });
});

describe("Department Manager rules", () => {
  it("replaces the manager: the previous one stays as an Employee and there is still exactly one manager", async () => {
    await assignManager(admin, "acc", "emp");
    const managers = store.memberships.filter((m) => m.departmentId === "acc" && m.active && m.role === "MANAGER");
    expect(managers.map((m) => m.userId)).toEqual(["emp"]);
    expect(activeMemberships("mgr")[0]).toMatchObject({ departmentId: "acc", role: "EMPLOYEE" });
    expect(store.memberships.find((m) => m.id === "m1")).toMatchObject({ active: false, role: "MANAGER" });
    const audit = store.audits.find((a) => a.action === "department.managerAssigned")!;
    expect(audit.metadata).toMatchObject({ newManagerUserId: "emp", previousManagerUserId: "mgr" });
  });

  it("can fill a brand-new department from any user, resolving the circular flow", async () => {
    await assignManager(admin, "new", "emp", true);
    expect(activeMemberships("emp")[0]).toMatchObject({ departmentId: "new", role: "MANAGER" });
    expect(store.memberships.find((m) => m.userId === "emp" && m.departmentId === "acc")).toMatchObject({ active: false });
  });

  it("allows a department to be left without a manager when its manager moves, and says so in the audit", async () => {
    await setUserMembership(admin, "mgr", { departmentId: "cm", role: "EMPLOYEE" });
    expect(store.memberships.filter((m) => m.departmentId === "acc" && m.active && m.role === "MANAGER")).toHaveLength(0);
    expect(store.audits[0].metadata).toMatchObject({ leftManagerVacancy: true });
  });

  it("makes the database-level invariant hold: two active managers can never exist", async () => {
    await assignManager(admin, "acc", "emp");
    await assignManager(admin, "acc", "emp2");
    expect(store.memberships.filter((m) => m.departmentId === "acc" && m.active && m.role === "MANAGER")).toHaveLength(1);
  });
});

describe("campaign safety", () => {
  const participation = (userId: string, status: string) => ({
    id: `part-${userId}`,
    userId,
    status: "ACTIVE",
    campaignId: "c1",
    campaign: { id: "c1", name: "Nov analysis", departmentId: "acc", status },
  });

  it("requires explicit acknowledgement before moving a participant of an open campaign, and leaves the participation untouched", async () => {
    store.participants = [participation("emp", "ACTIVE")];
    const snapshot = JSON.stringify(store.participants);

    await expect(setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errCampaignImpact" });
    expect(activeMemberships("emp")[0].departmentId).toBe("acc");

    await setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" }, true);
    expect(activeMemberships("emp")[0].departmentId).toBe("cm");
    expect(JSON.stringify(store.participants)).toBe(snapshot);
    expect(store.audits[0].metadata).toMatchObject({ campaignParticipationsLeftUnchanged: 1 });
  });

  it("does not warn for locked campaigns or for users who are not participants", async () => {
    store.participants = [participation("emp", "LOCKED")];
    await expect(setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" })).resolves.toEqual({ changed: true });
    await expect(setUserMembership(admin, "emp2", { departmentId: "cm", role: "EMPLOYEE" })).resolves.toEqual({ changed: true });
  });
});

describe("deactivation and reactivation", () => {
  it("deactivates without deleting: membership ends, the user and historical campaign records survive", async () => {
    store.participants = [
      { id: "old", userId: "emp", status: "STOPPED", campaignId: "c0", campaign: { id: "c0", departmentId: "acc", status: "LOCKED" } },
    ];
    await deactivateUser(admin, "emp");

    expect(store.users.find((u) => u.id === "emp")).toMatchObject({ active: false });
    expect(activeMemberships("emp")).toHaveLength(0);
    expect(store.memberships.find((m) => m.id === "m2")).toMatchObject({ active: false });
    expect(store.memberships.find((m) => m.id === "m2")!.endedAt).toBeInstanceOf(Date);
    expect(store.participants).toHaveLength(1);
    expect(store.participants[0]).toMatchObject({ id: "old", userId: "emp", campaignId: "c0" });
    expect(actions()).toContain("user.deactivated");
  });

  it("asks for acknowledgement when the user is in an open campaign", async () => {
    store.participants = [{ id: "p", userId: "emp", status: "ACTIVE", campaignId: "c1", campaign: { id: "c1", departmentId: "acc", status: "ACTIVE" } }];
    await expect(deactivateUser(admin, "emp")).rejects.toMatchObject({ code: "errCampaignImpact" });
    expect(store.users.find((u) => u.id === "emp")!.active).toBe(true);
    await deactivateUser(admin, "emp", true);
    expect(store.participants).toHaveLength(1);
    expect(store.participants[0].status).toBe("ACTIVE");
  });

  it("does not deactivate administrators or the acting admin", async () => {
    await expect(deactivateUser(admin, "admin")).rejects.toMatchObject({ code: "errCannotDeactivateAdmin" });
  });

  it("vacates the manager seat when a manager is deactivated", async () => {
    await deactivateUser(admin, "mgr");
    expect(store.memberships.filter((m) => m.departmentId === "acc" && m.active && m.role === "MANAGER")).toHaveLength(0);
    expect(store.audits.find((a) => a.action === "user.deactivated")!.metadata).toMatchObject({ wasManager: true });
  });

  it("blocks assigning an inactive user, then reactivates with a new membership period and keeps history", async () => {
    await deactivateUser(admin, "emp");
    await expect(setUserMembership(admin, "emp", { departmentId: "acc", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errUserInactive" });

    await reactivateUser(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" });
    expect(store.users.find((u) => u.id === "emp")!.active).toBe(true);
    const history = store.memberships.filter((m) => m.userId === "emp");
    expect(history).toHaveLength(2);
    expect(history.find((m) => m.id === "m2")).toMatchObject({ departmentId: "acc", active: false });
    expect(activeMemberships("emp")[0].departmentId).toBe("cm");
    expect(actions()).toEqual(expect.arrayContaining(["user.deactivated", "user.reactivated"]));
    await expect(reactivateUser(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errUserAlreadyActive" });
  });

  it("lists active, inactive and all users", async () => {
    await deactivateUser(admin, "emp");
    const names = async (f: "active" | "inactive" | "all") => (await listUsers(admin, f)).map((u: Row) => u.id).sort();
    expect(await names("inactive")).toEqual(["emp"]);
    expect(await names("active")).not.toContain("emp");
    expect(await names("all")).toContain("emp");
    expect((await names("all")).length).toBe(5);
  });
});

describe("new campaigns", () => {
  it("leave deactivated users out of the default participants", async () => {
    await deactivateUser(admin, "emp2");
    await createCampaign(admin, {
      departmentId: "acc",
      name: "Nov analysis",
      startDate: "2026-11-09",
      endDate: "2026-11-27",
      reviewWindowDays: 2,
      retrospectiveWindowDays: 3,
      reminderTime: "16:00",
    });
    // The Department Manager is a default participant; the deactivated Employee is not.
    expect(store.createdParticipants.map((p) => p.userId).sort()).toEqual(["emp", "mgr"]);
  });

  const campaignInput = (departmentId: string) => ({
    departmentId,
    name: "Nov analysis",
    startDate: "2026-11-09",
    endDate: "2026-11-27",
    reviewWindowDays: 2,
    retrospectiveWindowDays: 3,
    reminderTime: "16:00",
  });

  it("include the Department Manager together with the active Employees by default", async () => {
    await createCampaign(manager, campaignInput("acc"));
    expect(store.createdParticipants.map((p) => p.userId).sort()).toEqual(["emp", "emp2", "mgr"]);
  });

  it("do not include an Organization Admin who has no department membership", async () => {
    await createCampaign(admin, campaignInput("acc"));
    expect(store.createdParticipants.map((p) => p.userId)).not.toContain("admin");
  });

  it("include an Organization Admin who is a member of the department, as Employee or as Department Manager", async () => {
    store.users.push(person("anna", "Anna", { isOrgAdmin: true }));
    store.memberships.push(membership("m9", "anna", "acc", "EMPLOYEE"));
    await createCampaign(admin, campaignInput("acc"));
    expect(store.createdParticipants.map((p) => p.userId)).toContain("anna");

    store.createdParticipants = [];
    await setUserMembership(admin, "anna", { departmentId: "acc", role: "MANAGER" });
    await createCampaign({ ...admin, isOrgAdmin: true }, campaignInput("acc"));
    expect(store.createdParticipants.map((p) => p.userId).sort()).toEqual(["anna", "emp", "emp2", "mgr"]);
  });

  it("do not make an Organization Admin a participant of another department's campaign", async () => {
    store.users.push(person("anna", "Anna", { isOrgAdmin: true }));
    store.memberships.push(membership("m9", "anna", "acc", "MANAGER"));
    store.memberships.find((m) => m.id === "m1")!.role = "EMPLOYEE"; // keep one manager in acc
    await createCampaign(admin, campaignInput("cm"));
    expect(store.createdParticipants.map((p) => p.userId)).toEqual(["cmmgr"]);
  });

  it("let a Department Manager create a campaign for their own department only", async () => {
    await expect(createCampaign(manager, campaignInput("cm"))).rejects.toMatchObject({ code: "errForbidden" });
  });
});

describe("membership change preview (the confirmation step)", () => {
  const openParticipation = {
    id: "p",
    userId: "emp",
    status: "ACTIVE",
    campaignId: "c1",
    campaign: { id: "c1", name: "Nov analysis", departmentId: "acc", status: "ACTIVE" },
  };

  it("describes a transfer without changing anything, and lists the campaign it would leave untouched", async () => {
    store.participants = [openParticipation];
    const before = JSON.stringify({ m: store.memberships, p: store.participants, u: store.users });

    const preview = await getMembershipChangePreview(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" });

    expect(preview.kind).toBe("transfer");
    expect(preview.fromDepartment).toMatchObject({ id: "acc", name: "Accounting" });
    expect(preview.department).toMatchObject({ id: "cm" });
    expect(preview.impactedCampaigns.map((c: Row) => c.name)).toEqual(["Nov analysis"]);
    expect(JSON.stringify({ m: store.memberships, p: store.participants, u: store.users })).toBe(before);
    expect(store.audits).toHaveLength(0);
  });

  it("transfer needs the acknowledgement, keeps the old membership as history and leaves participation alone", async () => {
    store.participants = [openParticipation];
    await expect(setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errCampaignImpact" });
    await setUserMembership(admin, "emp", { departmentId: "cm", role: "EMPLOYEE" }, true);

    expect(store.memberships.find((m) => m.id === "m2")).toMatchObject({ departmentId: "acc", active: false });
    expect(activeMemberships("emp")).toHaveLength(1);
    expect(activeMemberships("emp")[0]).toMatchObject({ departmentId: "cm", role: "EMPLOYEE" });
    expect(store.participants).toEqual([openParticipation]);
    expect(actions()).toContain("user.departmentChanged");
  });

  it("reports an add for a user without a department, a role change inside a department and no change", async () => {
    store.users.push(person("free", "Vaba"));
    expect((await getMembershipChangePreview(admin, "free", { departmentId: "cm", role: "EMPLOYEE" })).kind).toBe("add");
    expect((await getMembershipChangePreview(admin, "emp", { departmentId: "acc", role: "MANAGER" })).kind).toBe("roleChange");
    expect((await getMembershipChangePreview(admin, "emp", { departmentId: "acc", role: "EMPLOYEE" })).kind).toBe("none");
  });

  it("names the manager who would become an Employee", async () => {
    const preview = await getMembershipChangePreview(admin, "emp", { departmentId: "acc", role: "MANAGER" });
    expect(preview.replacedManager).toMatchObject({ id: "mgr" });
  });

  it("does not preview anything for inactive users or non-admin actors", async () => {
    await deactivateUser(admin, "emp2");
    await expect(getMembershipChangePreview(admin, "emp2", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errUserInactive" });
    await expect(getMembershipChangePreview(manager, "emp", { departmentId: "cm", role: "EMPLOYEE" })).rejects.toMatchObject({ code: "errForbidden" });
  });
});

describe("transfer candidates", () => {
  it("do not include inactive users, and treat an Organization Admin like any other candidate", async () => {
    await deactivateUser(admin, "emp2");
    const assignable = await listAssignableUsers(admin);
    const ids = assignable.map((u: Row) => u.id);
    expect(ids).not.toContain("emp2");
    expect(ids).toContain("admin");

    const groups = groupCandidates(
      assignable.map((u: Row) => ({ id: u.id, name: u.name, active: u.active, isOrgAdmin: u.isOrgAdmin, membership: null })),
      { targetDepartmentId: "cm", includeTargetDepartment: false },
    );
    expect(groups.flatMap((g) => g.users.map((x) => x.id))).not.toContain("emp2");
  });
});

