import type { DepartmentRole, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

export const userInputSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
});
export const membershipInputSchema = z.object({
  departmentId: z.string().min(1),
  role: z.enum(["EMPLOYEE", "MANAGER"]),
});
export type UserInput = z.infer<typeof userInputSchema>;
export type MembershipInput = z.infer<typeof membershipInputSchema>;

/** Campaign states in which a participant row still matters to the department. */
const OPEN_CAMPAIGN_STATUSES = ["DRAFT", "INITIAL_MAPPING", "ACTIVE", "REVIEW_WINDOW"] as const;

function requireUserAdmin(actor: Actor) {
  if (!can(actor, "user:manage", { organizationId: actor.organizationId })) throw new ForbiddenError();
}

const displayName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

async function loadManagedUser(tx: Tx, actor: Actor, userId: string) {
  const user = await tx.user.findFirst({ where: { id: userId, organizationId: actor.organizationId } });
  if (!user) throw new AppError("errNotFound");
  return user;
}

/**
 * Campaigns (not yet locked) in `departmentId` where the user is an active participant.
 * Department membership and campaign participation are separate: moving or deactivating
 * a user never touches CampaignParticipant rows, so the admin has to acknowledge this and
 * the Department Manager handles the participation (stop / exclude) separately.
 */
async function campaignImpact(tx: Tx, userId: string, departmentId: string) {
  return tx.campaignParticipant.findMany({
    where: { userId, status: "ACTIVE", campaign: { departmentId, status: { in: [...OPEN_CAMPAIGN_STATUSES] } } },
    include: { campaign: true },
  });
}

async function assertCampaignImpactAcknowledged(tx: Tx, userId: string, departmentId: string, acknowledged: boolean) {
  const impact = await campaignImpact(tx, userId, departmentId);
  if (impact.length > 0 && !acknowledged) throw new AppError("errCampaignImpact");
  return impact.length;
}

/**
 * Core membership change, always inside the caller's transaction. Memberships are
 * history: the current row is ended (never edited or deleted) and a new row starts.
 * Order matters for the partial unique indexes (one active membership per user, one
 * active manager per department): close first, then create.
 */
async function applyMembership(
  tx: Tx,
  actor: Actor,
  userId: string,
  target: MembershipInput,
  acknowledgedCampaignImpact: boolean,
) {
  const user = await loadManagedUser(tx, actor, userId);
  // Organization Admin is a separate privilege: an admin may hold one department membership like anyone else.
  if (!user.active) throw new AppError("errUserInactive");
  const department = await tx.department.findFirst({ where: { id: target.departmentId, organizationId: actor.organizationId } });
  if (!department) throw new AppError("errNotFound");

  const current = await tx.departmentMembership.findFirst({ where: { userId, active: true } });
  if (current && current.departmentId === target.departmentId && current.role === target.role) return { changed: false };

  const movingDepartment = current !== null && current.departmentId !== target.departmentId;
  let impactCount = 0;
  if (current && movingDepartment) {
    impactCount = await assertCampaignImpactAcknowledged(tx, userId, current.departmentId, acknowledgedCampaignImpact);
  }

  const now = new Date();
  if (current) await tx.departmentMembership.update({ where: { id: current.id }, data: { active: false, endedAt: now } });

  let replacedManagerId: string | null = null;
  if (target.role === "MANAGER") {
    const other = await tx.departmentMembership.findFirst({
      where: { departmentId: target.departmentId, active: true, role: "MANAGER", userId: { not: userId } },
    });
    if (other) {
      // The previous manager stays in the department as an Employee.
      await tx.departmentMembership.update({ where: { id: other.id }, data: { active: false, endedAt: now } });
      await tx.departmentMembership.create({
        data: { userId: other.userId, departmentId: target.departmentId, role: "EMPLOYEE", startedAt: now },
      });
      replacedManagerId = other.userId;
    }
  }

  const membership = await tx.departmentMembership.create({
    data: { userId, departmentId: target.departmentId, role: target.role, startedAt: now },
  });

  const base = { organizationId: actor.organizationId, actorId: actor.id, targetType: "DepartmentMembership", targetId: membership.id };
  if (!current) {
    await writeAudit(tx, { ...base, departmentId: target.departmentId, action: "user.departmentAssigned", metadata: { userId, role: target.role } });
  } else if (movingDepartment) {
    await writeAudit(tx, {
      ...base,
      departmentId: target.departmentId,
      action: "user.departmentChanged",
      metadata: {
        userId,
        fromDepartmentId: current.departmentId,
        toDepartmentId: target.departmentId,
        fromRole: current.role,
        toRole: target.role,
        campaignParticipationsLeftUnchanged: impactCount,
        // The department the user left has no manager until the admin assigns one.
        leftManagerVacancy: current.role === "MANAGER",
      },
    });
  } else {
    await writeAudit(tx, {
      ...base,
      departmentId: target.departmentId,
      action: "user.roleChanged",
      metadata: { userId, fromRole: current.role, toRole: target.role },
    });
  }
  if (target.role === "MANAGER") {
    await writeAudit(tx, {
      ...base,
      departmentId: target.departmentId,
      action: "department.managerAssigned",
      metadata: { newManagerUserId: userId, previousManagerUserId: replacedManagerId },
    });
  }
  return { changed: true };
}

export async function createUser(actor: Actor, userInput: UserInput, membership: MembershipInput) {
  requireUserAdmin(actor);
  const input = userInputSchema.parse(userInput);
  const target = membershipInputSchema.parse(membership);
  return db.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email: input.email } })) throw new AppError("errEmailTaken");
    const user = await tx.user.create({
      data: { organizationId: actor.organizationId, ...input, name: displayName(input) },
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "user.created",
      targetType: "User",
      targetId: user.id,
    });
    await applyMembership(tx, actor, user.id, target, true);
    return user;
  });
}

export async function updateUser(actor: Actor, userId: string, userInput: UserInput) {
  requireUserAdmin(actor);
  const input = userInputSchema.parse(userInput);
  await db.$transaction(async (tx) => {
    const user = await loadManagedUser(tx, actor, userId);
    const other = await tx.user.findUnique({ where: { email: input.email } });
    if (other && other.id !== userId) throw new AppError("errEmailTaken");
    await tx.user.update({ where: { id: userId }, data: { ...input, name: displayName(input) } });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "user.updated",
      targetType: "User",
      targetId: user.id,
      // Field names only: values (such as the email address) are not copied into the audit log.
      metadata: {
        changed: (["firstName", "lastName", "email"] as const).filter((f) => user[f] !== input[f]),
      },
    });
  });
}

/** Moves or re-roles a user. Use for assignment, department change and role change alike. */
export async function setUserMembership(actor: Actor, userId: string, membership: MembershipInput, acknowledgedCampaignImpact = false) {
  requireUserAdmin(actor);
  const target = membershipInputSchema.parse(membership);
  return db.$transaction((tx) => applyMembership(tx, actor, userId, target, acknowledgedCampaignImpact));
}

/**
 * Deactivates (never deletes) a user: the active membership is ended but kept as
 * history, historical campaign and analysis rows keep referencing the user, and
 * the user can no longer sign in or be picked for new campaigns.
 */
export async function deactivateUser(actor: Actor, userId: string, acknowledgedCampaignImpact = false) {
  requireUserAdmin(actor);
  await db.$transaction(async (tx) => {
    const user = await loadManagedUser(tx, actor, userId);
    if (user.isOrgAdmin || user.id === actor.id) throw new AppError("errCannotDeactivateAdmin");
    if (!user.active) throw new AppError("errUserInactive");

    const current = await tx.departmentMembership.findFirst({ where: { userId, active: true } });
    let impactCount = 0;
    if (current) {
      impactCount = await assertCampaignImpactAcknowledged(tx, userId, current.departmentId, acknowledgedCampaignImpact);
      await tx.departmentMembership.update({ where: { id: current.id }, data: { active: false, endedAt: new Date() } });
    }
    await tx.user.update({ where: { id: userId }, data: { active: false } });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      departmentId: current?.departmentId ?? null,
      actorId: actor.id,
      action: "user.deactivated",
      targetType: "User",
      targetId: userId,
      metadata: {
        formerDepartmentId: current?.departmentId ?? null,
        wasManager: current?.role === "MANAGER",
        campaignParticipationsLeftUnchanged: impactCount,
      },
    });
  });
}

/** Reactivates a user and starts a new membership period; earlier history is kept. */
export async function reactivateUser(actor: Actor, userId: string, membership: MembershipInput) {
  requireUserAdmin(actor);
  const target = membershipInputSchema.parse(membership);
  await db.$transaction(async (tx) => {
    const user = await loadManagedUser(tx, actor, userId);
    if (user.active) throw new AppError("errUserAlreadyActive");
    await tx.user.update({ where: { id: userId }, data: { active: true } });
    await applyMembership(tx, actor, userId, target, true);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      departmentId: target.departmentId,
      actorId: actor.id,
      action: "user.reactivated",
      targetType: "User",
      targetId: userId,
    });
  });
}

export type UserStatusFilter = "active" | "inactive" | "all";

export async function listUsers(actor: Actor, status: UserStatusFilter = "active") {
  requireUserAdmin(actor);
  return db.user.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(status === "all" ? {} : { active: status === "active" }),
    },
    include: { memberships: { where: { active: true }, include: { department: true } } },
    orderBy: [{ isOrgAdmin: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
}

/** One user with their full membership history and the campaigns a move or deactivation would leave behind. */
export async function getUserDetail(actor: Actor, userId: string) {
  requireUserAdmin(actor);
  const user = await db.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    include: { memberships: { include: { department: true }, orderBy: { startedAt: "desc" } } },
  });
  if (!user) throw new AppError("errNotFound");
  const current = user.memberships.find((m) => m.active) ?? null;
  const impact = current
    ? await db.campaignParticipant.findMany({
        where: { userId, status: "ACTIVE", campaign: { departmentId: current.departmentId, status: { in: [...OPEN_CAMPAIGN_STATUSES] } } },
        include: { campaign: true },
      })
    : [];
  return { user, current, history: user.memberships, impactedCampaigns: impact.map((p) => p.campaign) };
}

export type MembershipChangeKind = "add" | "transfer" | "roleChange" | "none";

/**
 * Read-only preview of a membership change, for the confirmation page. Nothing is
 * modified: it reports what would happen, including campaign participation that the
 * change would leave untouched.
 */
export async function getMembershipChangePreview(actor: Actor, userId: string, membership: MembershipInput) {
  requireUserAdmin(actor);
  const target = membershipInputSchema.parse(membership);
  const user = await db.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    include: { memberships: { where: { active: true }, include: { department: true } } },
  });
  if (!user) throw new AppError("errNotFound");
  if (!user.active) throw new AppError("errUserInactive");
  const department = await db.department.findFirst({ where: { id: target.departmentId, organizationId: actor.organizationId } });
  if (!department) throw new AppError("errNotFound");

  const current = user.memberships[0] ?? null;
  const kind: MembershipChangeKind = !current
    ? "add"
    : current.departmentId !== target.departmentId
      ? "transfer"
      : current.role === target.role
        ? "none"
        : "roleChange";

  const impactedCampaigns =
    current && kind === "transfer"
      ? (
          await db.campaignParticipant.findMany({
            where: {
              userId,
              status: "ACTIVE",
              campaign: { departmentId: current.departmentId, status: { in: [...OPEN_CAMPAIGN_STATUSES] } },
            },
            include: { campaign: true },
          })
        ).map((p) => p.campaign)
      : [];

  const replacedManager =
    target.role === "MANAGER"
      ? await db.departmentMembership.findFirst({
          where: { departmentId: target.departmentId, active: true, role: "MANAGER", userId: { not: userId } },
          include: { user: true },
        })
      : null;

  return {
    kind,
    user,
    department,
    role: target.role,
    fromDepartment: current?.department ?? null,
    fromRole: current?.role ?? null,
    impactedCampaigns,
    replacedManager: replacedManager?.user ?? null,
  };
}

/** Active users (Organization Admins included, they may hold a membership), for choosing members and managers. */
export async function listAssignableUsers(actor: Actor) {
  requireUserAdmin(actor);
  return db.user.findMany({
    where: { organizationId: actor.organizationId, active: true },
    include: { memberships: { where: { active: true }, include: { department: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export type { DepartmentRole };
