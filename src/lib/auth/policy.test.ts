import { describe, expect, it } from "vitest";
import { can, capabilitiesOf, type Actor } from "./policy";

const org = "org1";

// Organization privilege, department role and department are independent.
const actor = (id: string, isOrgAdmin: boolean, departmentRole: Actor["departmentRole"], departmentId: string | null): Actor => ({
  id,
  organizationId: org,
  isOrgAdmin,
  departmentRole,
  departmentId,
});

const admin = actor("a", true, null, null); // Organization Admin, no department
const adminEmployee = actor("ae", true, "EMPLOYEE", "acc"); // Organization Admin + Employee
const adminManager = actor("am", true, "MANAGER", "acc"); // Organization Admin + Department Manager
const manager = actor("m", false, "MANAGER", "acc");
const employee = actor("e1", false, "EMPLOYEE", "acc");

const acc = { organizationId: org, departmentId: "acc" };
const hr = { organizationId: org, departmentId: "hr" };
const own = (a: Actor, departmentId = "acc") => ({ organizationId: org, departmentId, ownerId: a.id });

describe("organization privilege", () => {
  it("lets only Organization Admins create departments, assign managers, manage users and reference data", () => {
    const r = { organizationId: org };
    for (const a of [admin, adminEmployee, adminManager]) {
      expect(can(a, "department:create", r)).toBe(true);
      expect(can(a, "department:assignManager", r)).toBe(true);
      expect(can(a, "user:manage", r)).toBe(true);
      expect(can(a, "reference:manage", r)).toBe(true);
    }
    for (const a of [manager, employee]) {
      expect(can(a, "department:create", r)).toBe(false);
      expect(can(a, "user:manage", r)).toBe(false);
      expect(can(a, "reference:manage", r)).toBe(false);
    }
  });

  it("lets only the admin reopen a locked campaign, never a plain manager", () => {
    expect(can(admin, "campaign:reopen", acc)).toBe(true);
    expect(can(manager, "campaign:reopen", acc)).toBe(false);
  });

  it("denies everything across organizations", () => {
    expect(can(admin, "department:create", { organizationId: "other" })).toBe(false);
    expect(can(adminManager, "campaign:manage", { organizationId: "other", departmentId: "acc" })).toBe(false);
  });
});

describe("Organization Admin alone grants nothing in a department", () => {
  it("does not manage campaigns or analysis, and has no participant access", () => {
    expect(can(admin, "campaign:manage", acc)).toBe(false);
    expect(can(admin, "analysis:view", acc)).toBe(false);
    expect(can(admin, "opportunity:validate", acc)).toBe(false);
    for (const action of ["campaign:acknowledge", "mapping:write", "diary:write", "diary:confirm", "diary:read"] as const) {
      expect(can(admin, action, { ...acc, ownerId: admin.id })).toBe(false);
    }
  });

  it("can still create campaigns for any department and view them", () => {
    expect(can(admin, "campaign:create", acc)).toBe(true);
    expect(can(admin, "campaign:create", hr)).toBe(true);
    expect(can(admin, "campaign:view", hr)).toBe(true);
  });
});

describe("Department Manager scope", () => {
  it("manages only the department they manage", () => {
    expect(can(manager, "campaign:manage", acc)).toBe(true);
    expect(can(manager, "campaign:manage", hr)).toBe(false);
    expect(can(manager, "analysis:view", hr)).toBe(false);
    expect(can(manager, "campaign:create", hr)).toBe(false);
  });

  it("is not granted to Employees or to an Organization Admin who is only an Employee", () => {
    expect(can(employee, "campaign:manage", acc)).toBe(false);
    expect(can(employee, "opportunity:validate", acc)).toBe(false);
    expect(can(adminEmployee, "campaign:manage", acc)).toBe(false);
    expect(can(adminEmployee, "campaign:create", acc)).toBe(true); // through the admin privilege
  });
});

describe("Department Manager who is also a participant", () => {
  it("keeps manager functions and gains participant functions for their own data", () => {
    for (const action of ["campaign:manage", "analysis:view", "opportunity:validate"] as const) {
      expect(can(manager, action, acc)).toBe(true);
    }
    expect(can(manager, "campaign:acknowledge", acc)).toBe(true);
    for (const action of ["mapping:write", "diary:write", "diary:confirm", "diary:read"] as const) {
      expect(can(manager, action, own(manager))).toBe(true);
    }
  });

  it("can never reach another participant's mapping or diary", () => {
    const other = { ...acc, ownerId: "e1" };
    for (const action of ["mapping:write", "diary:write", "diary:confirm", "diary:read"] as const) {
      expect(can(manager, action, other)).toBe(false);
      expect(can(adminManager, action, other)).toBe(false);
      expect(can(employee, action, { ...acc, ownerId: "e2" })).toBe(false);
    }
  });

  it("has no participant access outside their own department", () => {
    for (const action of ["mapping:write", "diary:write", "diary:confirm"] as const) {
      expect(can(manager, action, own(manager, "hr"))).toBe(false);
      expect(can(adminManager, action, own(adminManager, "hr"))).toBe(false);
    }
    expect(can(adminManager, "campaign:acknowledge", hr)).toBe(false);
    expect(can(adminManager, "campaign:manage", hr)).toBe(false);
  });
});

describe("combinations", () => {
  it("Organization Admin + Employee: organization functions and own participant functions, no management", () => {
    expect(can(adminEmployee, "user:manage", acc)).toBe(true);
    expect(can(adminEmployee, "mapping:write", own(adminEmployee))).toBe(true);
    expect(can(adminEmployee, "diary:confirm", own(adminEmployee))).toBe(true);
    expect(can(adminEmployee, "campaign:acknowledge", acc)).toBe(true);
    expect(can(adminEmployee, "campaign:manage", acc)).toBe(false);
  });

  it("Organization Admin + Department Manager: all three areas at once", () => {
    expect(can(adminManager, "user:manage", acc)).toBe(true);
    expect(can(adminManager, "campaign:manage", acc)).toBe(true);
    expect(can(adminManager, "campaign:reopen", acc)).toBe(true);
    expect(can(adminManager, "campaign:acknowledge", acc)).toBe(true);
    expect(can(adminManager, "mapping:write", own(adminManager))).toBe(true);
    expect(can(adminManager, "diary:write", own(adminManager))).toBe(true);
    expect(can(adminManager, "diary:confirm", own(adminManager))).toBe(true);
  });

  it("an Employee cannot see another employee's data or validate anything", () => {
    expect(can(employee, "diary:read", { ...acc, ownerId: "e2" })).toBe(false);
    expect(can(employee, "diary:read", own(employee))).toBe(true);
  });
});

describe("capabilities drive navigation, they do not replace authorization", () => {
  it("shows each area the user has, without a role switch", () => {
    expect(capabilitiesOf(admin)).toEqual({ organization: true, management: true, myWork: false });
    expect(capabilitiesOf(adminManager)).toEqual({ organization: true, management: true, myWork: true });
    expect(capabilitiesOf(adminEmployee)).toEqual({ organization: true, management: true, myWork: true });
    expect(capabilitiesOf(manager)).toEqual({ organization: false, management: true, myWork: true });
    expect(capabilitiesOf(employee)).toEqual({ organization: false, management: false, myWork: true });
  });
});
