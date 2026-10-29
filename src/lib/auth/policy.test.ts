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
});
