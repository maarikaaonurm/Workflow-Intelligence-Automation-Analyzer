export type MemberRole = "EMPLOYEE" | "MANAGER";

export interface CandidateUser {
  id: string;
  name: string;
  active: boolean;
  isOrgAdmin: boolean;
  /** The user's current active membership, if any. */
  membership: { departmentId: string; departmentName: string; role: MemberRole } | null;
}

export interface CandidateGroup {
  key: string;
  /** null = available users with no active department. */
  departmentId: string | null;
  departmentName: string | null;
  users: { id: string; name: string; departmentName: string | null; role: MemberRole | null }[];
}

/**
 * Groups people who can be added or transferred into a department. Inactive users and
 * Organization Admins are never candidates. Order: available users, then the target
 * department (only when `includeTargetDepartment`), then other departments by name.
 */
export function groupCandidates(
  users: CandidateUser[],
  options: { targetDepartmentId: string; includeTargetDepartment: boolean; excludeUserIds?: string[] },
): CandidateGroup[] {
  const excluded = new Set(options.excludeUserIds ?? []);
  const groups = new Map<string, CandidateGroup>();

  for (const user of users) {
    if (!user.active || user.isOrgAdmin || excluded.has(user.id)) continue;
    const m = user.membership;
    if (m && m.departmentId === options.targetDepartmentId && !options.includeTargetDepartment) continue;

    const key = m ? m.departmentId : "available";
    let group = groups.get(key);
    if (!group) {
      group = { key, departmentId: m ? m.departmentId : null, departmentName: m ? m.departmentName : null, users: [] };
      groups.set(key, group);
    }
    group.users.push({ id: user.id, name: user.name, departmentName: m ? m.departmentName : null, role: m ? m.role : null });
  }

  const rank = (g: CandidateGroup) => (g.departmentId === null ? 0 : g.departmentId === options.targetDepartmentId ? 1 : 2);
  return [...groups.values()]
    .map((g) => ({ ...g, users: [...g.users].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => rank(a) - rank(b) || (a.departmentName ?? "").localeCompare(b.departmentName ?? ""));
}
