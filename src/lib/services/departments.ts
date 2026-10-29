import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";

export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
  }
}

export async function createDepartment(actor: Actor, name: string) {
  if (!can(actor, "department:create", { organizationId: actor.organizationId })) {
    throw new ForbiddenError();
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
 * Assigns or replaces the single active Department Manager. The previous manager
 * stays in the department as an Employee. The user must already belong to this
 * department (non-admin users have exactly one department).
 */
export async function assignManager(actor: Actor, departmentId: string, userId: string) {
  return db.$transaction(async (tx) => {
    const department = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });
    if (!can(actor, "department:assignManager", department)) throw new ForbiddenError();

    const target = await tx.departmentMembership.findFirst({
      where: { userId, departmentId, active: true, user: { isOrgAdmin: false } },
    });
    if (!target) throw new Error("User is not an active member of this department");

    const current = await tx.departmentMembership.findFirst({
      where: { departmentId, active: true, role: "MANAGER" },
    });
    if (current?.userId === userId) return target;

    // Demote first so the one-active-manager unique index is never violated.
    if (current) {
      await tx.departmentMembership.update({ where: { id: current.id }, data: { role: "EMPLOYEE" } });
    }
    const updated = await tx.departmentMembership.update({
      where: { id: target.id },
      data: { role: "MANAGER" },
    });
    await writeAudit(tx, {
      organizationId: department.organizationId,
      departmentId,
      actorId: actor.id,
      action: "department.managerAssigned",
      targetType: "DepartmentMembership",
      targetId: updated.id,
      metadata: { newManagerUserId: userId, previousManagerUserId: current?.userId ?? null },
    });
    return updated;
  });
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
