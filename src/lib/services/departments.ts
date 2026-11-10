import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import { setUserMembership } from "@/lib/services/users";

export { ForbiddenError };

export async function createDepartment(actor: Actor, name: string) {
  if (!can(actor, "department:create", { organizationId: actor.organizationId })) {
    throw new ForbiddenError();
  }
  if (await db.department.findFirst({ where: { organizationId: actor.organizationId, name } })) {
    throw new AppError("errAlreadyExists");
  }
  return db.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: { organizationId: actor.organizationId, name },
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      departmentId: department.id,
      actorId: actor.id,
      action: "department.created",
      targetType: "Department",
      targetId: department.id,
    });
    return department;
  });
}

/**
 * Assigns or replaces the single active Department Manager. The user may come from
 * any department (or be a member already): they are moved here if needed, and the
 * previous manager stays in the department as an Employee. Membership history is
 * kept as ended and new rows, never rewritten.
 */
export async function assignManager(actor: Actor, departmentId: string, userId: string, acknowledgedCampaignImpact = false) {
  if (!can(actor, "department:assignManager", { organizationId: actor.organizationId })) throw new ForbiddenError();
  return setUserMembership(actor, userId, { departmentId, role: "MANAGER" }, acknowledgedCampaignImpact);
}

export async function listDepartments(actor: Actor) {
  return db.department.findMany({
    where:
      actor.role === "ADMIN"
        ? { organizationId: actor.organizationId }
        : { organizationId: actor.organizationId, id: actor.departmentId ?? "none" },
    include: {
      memberships: { where: { active: true }, include: { user: true }, orderBy: { user: { name: "asc" } } },
    },
    orderBy: { name: "asc" },
  });
}

/** One department with its active members (managers first) for the admin member-management page. */
export async function getDepartmentDetail(actor: Actor, departmentId: string) {
  if (!can(actor, "department:create", { organizationId: actor.organizationId })) throw new ForbiddenError();
  const department = await db.department.findFirst({
    where: { id: departmentId, organizationId: actor.organizationId },
    include: { memberships: { where: { active: true }, include: { user: true } } },
  });
  if (!department) throw new AppError("errNotFound");
  const members = [...department.memberships].sort(
    (a, b) => Number(b.role === "MANAGER") - Number(a.role === "MANAGER") || a.user.name.localeCompare(b.user.name),
  );
  return { department, members, manager: members.find((m) => m.role === "MANAGER") ?? null };
}
