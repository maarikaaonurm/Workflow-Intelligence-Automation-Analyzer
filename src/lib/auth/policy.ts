/**
 * Three independent concepts (see docs/authorization.md):
 *
 *  1. Organization privilege  - `isOrgAdmin`
 *  2. Department role         - `departmentRole` in the user's one active department
 *  3. Campaign participation  - a CampaignParticipant row, checked by the services
 *
 * None of them implies another. An Organization Admin may have no department, or be an
 * Employee or Department Manager of one department; a Department Manager may or may not
 * take part in the campaign they manage.
 */
export type DepartmentRole = "MANAGER" | "EMPLOYEE";

export interface Actor {
  id: string;
  organizationId: string;
  /** Organization-level privilege. Grants no department membership and no campaign participation. */
  isOrgAdmin: boolean;
  /** Role in the user's single active department; null without a department membership. */
  departmentRole: DepartmentRole | null;
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
  | "mapping:write"
  | "diary:write"
  | "diary:confirm"
  | "reference:manage"
  | "campaign:reopen"
  | "diary:read"
  | "analysis:view"
  | "opportunity:validate"
  | "audit:view";

export interface Resource {
  organizationId: string;
  departmentId?: string | null;
  /** Owner of the record, for per-participant data such as a mapping or a diary. */
  ownerId?: string;
}

/** True when the actor manages this department (Department Manager role there). */
export function managesDepartment(actor: Actor, departmentId: string | null | undefined): boolean {
  return actor.departmentRole === "MANAGER" && departmentId != null && actor.departmentId === departmentId;
}

/** Which areas of the application the actor may reach. Drives navigation, never authorization. */
export function capabilitiesOf(actor: Actor) {
  return {
    organization: actor.isOrgAdmin,
    management: actor.departmentRole === "MANAGER" || actor.isOrgAdmin,
    myWork: actor.departmentRole !== null,
  };
}

/** Pure authorization policy. Server entry points must call this before acting. */
export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (actor.organizationId !== resource.organizationId) return false;

  const sameDepartment =
    actor.departmentId !== null && resource.departmentId != null && actor.departmentId === resource.departmentId;
  const manages = managesDepartment(actor, resource.departmentId);
  // Participant functions: only the user's own records, in their own department, in any department role.
  const ownParticipantData = actor.departmentRole !== null && sameDepartment && resource.ownerId === actor.id;

  switch (action) {
    // Organization privilege
    case "department:create":
    case "department:assignManager":
    case "user:manage":
    case "campaign:reopen":
    case "audit:view":
    case "reference:manage":
      return actor.isOrgAdmin;

    // Department visibility
    case "department:view":
    case "campaign:view":
      return actor.isOrgAdmin || sameDepartment;

    // Management of one department: the Department Manager of that department only.
    case "campaign:create":
      return actor.isOrgAdmin || manages;
    case "campaign:manage":
    case "analysis:view":
    case "opportunity:validate":
      return manages;

    // Participant functions (whether the person actually is a CampaignParticipant is checked by the service).
    case "campaign:acknowledge":
      return actor.departmentRole !== null && sameDepartment;
    case "mapping:write":
    case "diary:write":
    case "diary:confirm":
    case "diary:read":
      return ownParticipantData;

    default:
      return false;
  }
}
