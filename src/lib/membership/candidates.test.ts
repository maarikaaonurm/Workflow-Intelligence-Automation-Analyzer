import { describe, expect, it } from "vitest";
import { groupCandidates, type CandidateUser } from "./candidates";

const user = (id: string, name: string, dept: [string, string, "EMPLOYEE" | "MANAGER"] | null, extra: Partial<CandidateUser> = {}): CandidateUser => ({
  id,
  name,
  active: true,
  isOrgAdmin: false,
  membership: dept ? { departmentId: dept[0], departmentName: dept[1], role: dept[2] } : null,
  ...extra,
});

const people: CandidateUser[] = [
  user("b", "User B", ["acc", "Accounting", "EMPLOYEE"]),
  user("c", "User C", ["acc", "Accounting", "MANAGER"]),
  user("d", "User D", ["cm", "Credit Management", "EMPLOYEE"]),
  user("e", "User E", ["hr", "HR", "EMPLOYEE"]),
  user("a", "User A", null),
  user("x", "Inactive Ida", ["cm", "Credit Management", "EMPLOYEE"], { active: false }),
  user("adm", "Admin Anna", null, { isOrgAdmin: true }),
  user("t", "Target Tiina", ["new", "New department", "EMPLOYEE"]),
];

describe("groupCandidates", () => {
  const groups = groupCandidates(people, { targetDepartmentId: "new", includeTargetDepartment: false });

  it("never offers inactive users, but an Organization Admin is an ordinary candidate", () => {
    const ids = groups.flatMap((g) => g.users.map((u) => u.id));
    expect(ids).not.toContain("x");
    expect(ids).toContain("adm");
  });

  it("leaves out users who already belong to the target department", () => {
    expect(groups.flatMap((g) => g.users.map((u) => u.id))).not.toContain("t");
  });

  it("puts available users first, then departments alphabetically, users by name", () => {
    expect(groups.map((g) => g.departmentName)).toEqual([null, "Accounting", "Credit Management", "HR"]);
    expect(groups[1].users.map((u) => `${u.name}:${u.role}`)).toEqual(["User B:EMPLOYEE", "User C:MANAGER"]);
    expect(groups[0].users.map((u) => u.id)).toEqual(["adm", "a"]);
  });

  it("can include the target department, listed right after available users, and exclude chosen users", () => {
    const withTarget = groupCandidates(people, { targetDepartmentId: "new", includeTargetDepartment: true, excludeUserIds: ["e"] });
    expect(withTarget.map((g) => g.departmentName)).toEqual([null, "New department", "Accounting", "Credit Management"]);
  });
});
