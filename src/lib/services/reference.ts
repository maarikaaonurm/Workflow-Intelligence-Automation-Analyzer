import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import { ensureStandardReferenceData } from "@/lib/reference/standard";

function requireAdmin(actor: Actor) {
  if (!can(actor, "reference:manage", { organizationId: actor.organizationId })) throw new ForbiddenError();
}

export const categorySchema = z.object({
  departmentId: z.string().min(1).nullable(),
  nameEn: z.string().trim().min(1).max(100),
  nameEt: z.string().trim().min(1).max(100),
  definition: z.string().trim().min(1).max(500),
  belongsHere: z.string().trim().min(1).max(500),
  notBelongsHere: z.string().trim().min(1).max(500),
  boundaryExamples: z.string().trim().max(500).nullable(),
});

export const unitSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,39}$/),
  nameEn: z.string().trim().min(1).max(60),
  nameEt: z.string().trim().min(1).max(60),
});

export const systemSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** Reference data visible to the actor: standard items plus their own department's categories. */
export async function listReferenceData(actor: Actor, options: { includeInactive?: boolean } = {}) {
  const activeOnly = options.includeInactive && actor.role === "ADMIN" ? {} : { active: true };
  const [categories, units, systems] = await Promise.all([
    db.activityCategory.findMany({
      where: {
        organizationId: actor.organizationId,
        ...activeOnly,
        ...(actor.role === "ADMIN" ? {} : { OR: [{ departmentId: null }, { departmentId: actor.departmentId ?? "none" }] }),
      },
      orderBy: [{ departmentId: "asc" }, { nameEn: "asc" }],
    }),
    db.volumeUnit.findMany({ where: { organizationId: actor.organizationId, ...activeOnly }, orderBy: { nameEn: "asc" } }),
    db.systemReference.findMany({ where: { organizationId: actor.organizationId, ...activeOnly }, orderBy: { name: "asc" } }),
  ]);
  return { categories, units, systems };
}

export async function loadStandardReferenceData(actor: Actor) {
  requireAdmin(actor);
  await db.$transaction(async (tx) => {
    await ensureStandardReferenceData(tx, actor.organizationId);
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: "reference.standardLoaded",
      targetType: "Organization",
      targetId: actor.organizationId,
    });
  });
}

export async function createCategory(actor: Actor, input: z.infer<typeof categorySchema>) {
  requireAdmin(actor);
  if (input.departmentId) {
    const dept = await db.department.findFirst({ where: { id: input.departmentId, organizationId: actor.organizationId } });
    if (!dept) throw new AppError("errNotFound");
  }
  const clash = await db.activityCategory.findFirst({
    where: { organizationId: actor.organizationId, departmentId: input.departmentId, nameEn: input.nameEn },
  });
  if (clash) throw new AppError("errAlreadyExists");
  await db.$transaction(async (tx) => {
    const category = await tx.activityCategory.create({ data: { ...input, organizationId: actor.organizationId } });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      departmentId: input.departmentId,
      actorId: actor.id,
      action: "reference.categoryCreated",
      targetType: "ActivityCategory",
      targetId: category.id,
    });
  });
}

export async function createUnit(actor: Actor, input: z.infer<typeof unitSchema>) {
  requireAdmin(actor);
  if (await db.volumeUnit.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key: input.key } } })) {
    throw new AppError("errAlreadyExists");
  }
  await db.volumeUnit.create({ data: { ...input, organizationId: actor.organizationId } });
}

export async function createSystem(actor: Actor, input: z.infer<typeof systemSchema>) {
  requireAdmin(actor);
  if (await db.systemReference.findUnique({ where: { organizationId_name: { organizationId: actor.organizationId, name: input.name } } })) {
    throw new AppError("errAlreadyExists");
  }
  await db.systemReference.create({ data: { ...input, organizationId: actor.organizationId } });
}

export type ReferenceKind = "category" | "unit" | "system";

/** Activates or deactivates an item. Deactivated items stay on existing activities. */
export async function setReferenceActive(actor: Actor, kind: ReferenceKind, id: string, active: boolean) {
  requireAdmin(actor);
  const where = { id, organizationId: actor.organizationId };
  const result =
    kind === "category"
      ? await db.activityCategory.updateMany({ where, data: { active } })
      : kind === "unit"
        ? await db.volumeUnit.updateMany({ where, data: { active } })
        : await db.systemReference.updateMany({ where, data: { active } });
  if (result.count === 0) throw new AppError("errNotFound");
}
