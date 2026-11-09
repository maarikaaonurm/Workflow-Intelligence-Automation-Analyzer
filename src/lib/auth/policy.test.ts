import { describe, expect, it } from "vitest";
import { can, type Actor } from "./policy";

const org = "org1";
const admin: Actor = { id: "a", organizationId: org, role: "ADMIN", departmentId: null };
const manager: Actor = { id: "m", organizationId: org, role: "MANAGER", departmentId: "acc" };
const employee: Actor = { id: "e1", organizationId: org, role: "EMPLOYEE", departmentId: "acc" };

describe("authorization policy", () => {
  it("lets only admins create departments and assign managers", () => {
    const r = { organizationId: org };
    expect(can(admin, "department:create", r)).toBe(true);
    expect(can(manager, "department:create", r)).toBe(false);
    expect(can(employee, "department:assignManager", r)).toBe(false);
  });

  it("denies a manager access to another department", () => {
    expect(can(manager, "campaign:manage", { organizationId: org, departmentId: "acc" })).toBe(true);
    expect(can(manager, "campaign:manage", { organizationId: org, departmentId: "hr" })).toBe(false);
    expect(can(manager, "analysis:view", { organizationId: org, departmentId: "hr" })).toBe(false);
  });

  it("denies an employee another employee's diary", () => {
    const own = { organizationId: org, departmentId: "acc", ownerId: "e1" };
    const other = { organizationId: org, departmentId: "acc", ownerId: "e2" };
    expect(can(employee, "diary:read", own)).toBe(true);
    expect(can(employee, "diary:read", other)).toBe(false);
  });

  it("denies employees opportunity validation", () => {
    expect(can(employee, "opportunity:validate", { organizationId: org, departmentId: "acc" })).toBe(false);
    expect(can(manager, "opportunity:validate", { organizationId: org, departmentId: "acc" })).toBe(true);
  });

  it("lets only the admin reopen a locked campaign, never a manager", () => {
    const r = { organizationId: org, departmentId: "acc" };
    expect(can(admin, "campaign:reopen", r)).toBe(true);
    expect(can(manager, "campaign:reopen", r)).toBe(false);
  });

  it("denies everything across organizations", () => {
    expect(can(admin, "department:create", { organizationId: "other" })).toBe(false);
  });

  it("lets admins and the department manager create campaigns, but not employees or other departments' managers", () => {
    const acc = { organizationId: org, departmentId: "acc" };
    expect(can(admin, "campaign:create", acc)).toBe(true);
    expect(can(manager, "campaign:create", acc)).toBe(true);
    expect(can(manager, "campaign:create", { organizationId: org, departmentId: "hr" })).toBe(false);
    expect(can(employee, "campaign:create", acc)).toBe(false);
  });

  it("limits campaign management to the department manager and acknowledgement to employees", () => {
    const acc = { organizationId: org, departmentId: "acc" };
    expect(can(admin, "campaign:manage", acc)).toBe(false);
    expect(can(employee, "campaign:manage", acc)).toBe(false);
    expect(can(employee, "campaign:acknowledge", acc)).toBe(true);
    expect(can(manager, "campaign:acknowledge", acc)).toBe(false);
    expect(can(employee, "campaign:view", { organizationId: org, departmentId: "hr" })).toBe(false);
  });

  it("lets only the owning Employee write their Initial Activity Mapping", () => {
    const own = { organizationId: org, departmentId: "acc", ownerId: "e1" };
    expect(can(employee, "mapping:write", own)).toBe(true);
    expect(can(employee, "mapping:write", { ...own, ownerId: "e2" })).toBe(false);
    expect(can(manager, "mapping:write", own)).toBe(false);
    expect(can(admin, "mapping:write", own)).toBe(false);
  });

  it("lets only the Organization Admin manage reference data", () => {
    const r = { organizationId: org };
    expect(can(admin, "reference:manage", r)).toBe(true);
    expect(can(manager, "reference:manage", r)).toBe(false);
    expect(can(employee, "reference:manage", r)).toBe(false);
  });
});
