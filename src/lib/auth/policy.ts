export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";

export interface Actor {
  id: string;
  organizationId: string;
  role: Role;
  departmentId: string | null;
}

export type Action =
  | "department:create"
  | "department:assignManager"
  | "department:view"
  | "user:manage"
  | "campaign:create"
  | "campaign:manage"
  | "campaign:view"
  | "campaign:acknowledge"
  | "campaign:reopen"
  | "diary:read"
  | "analysis:view"
  | "opportunity:validate"
  | "audit:view";

export interface Resource {
  organizationId: string;
  departmentId?: string | null;
  /** Owner of the record, for per-employee data such as a diary. */
  ownerId?: string;
}

/** Pure authorization policy. Server entry points must call this before acting. */
export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (actor.organizationId !== resource.organizationId) return false;

  const sameDepartment =
    actor.departmentId !== null &&
    resource.departmentId != null &&
    actor.departmentId === resource.departmentId;

  switch (action) {
    case "department:create":
    case "department:assignManager":
    case "user:manage":
    case "campaign:reopen":
    case "audit:view":
      return actor.role === "ADMIN";
    case "department:view":
      return actor.role === "ADMIN" || sameDepartment;
    case "campaign:create":
      return actor.role === "ADMIN" || (actor.role === "MANAGER" && sameDepartment);
    case "campaign:manage":
    case "analysis:view":
    case "opportunity:validate":
      return actor.role === "MANAGER" && sameDepartment;
    case "campaign:view":
      return actor.role === "ADMIN" || sameDepartment;
    case "campaign:acknowledge":
      return actor.role === "EMPLOYEE" && sameDepartment;
    case "diary:read":
      // Only the owner sees detailed diary data in Phase 4; manager department
      // drill-downs get their own authorized view later.
      return actor.role === "EMPLOYEE" && resource.ownerId === actor.id && sameDepartment;
    default:
      return false;
  }
}
