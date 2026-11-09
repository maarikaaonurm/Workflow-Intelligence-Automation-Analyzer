import type { AnalysisCampaign, CampaignParticipant, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import { todayISO, toISODate } from "@/lib/campaigns/dates";
import { autoTransition, OBSERVATION_STATUSES } from "@/lib/campaigns/status";
import { syncCampaignStatus } from "@/lib/services/campaigns";
import { activityInputSchema, type ActivityInput } from "@/lib/mapping/schema";
import { MAX_IMPORT_ROWS, parseImportRecords, type ImportRow } from "@/lib/mapping/import";
import { readImportFile } from "@/lib/mapping/files";

type Tx = Prisma.TransactionClient;

const EDITABLE = ["INITIAL_MAPPING", "ACTIVE"];

interface OwnContext {
  campaign: AnalysisCampaign;
  participant: CampaignParticipant;
}

/**
 * Loads the actor's own participation and enforces the rules for changing their
 * mapping: own data only, acknowledgement first, campaign still collecting.
 */
async function loadOwnContext(tx: Tx, actor: Actor, campaignId: string): Promise<OwnContext> {
  const campaign = await tx.analysisCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError("errNotFound");
  if (!can(actor, "mapping:write", { organizationId: campaign.organizationId, departmentId: campaign.departmentId, ownerId: actor.id })) {
    throw new ForbiddenError();
  }
  const participant = await tx.campaignParticipant.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } });
  if (!participant || participant.status !== "ACTIVE") throw new ForbiddenError();

  // Use the calendar-corrected status so a campaign past its end date is not editable.
  const status = autoTransition(campaign.status, toISODate(campaign.startDate), toISODate(campaign.endDate), todayISO());
  if (!EDITABLE.includes(status)) throw new AppError("errCampaignClosed");
  if (!(await tx.campaignAcknowledgement.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } }))) {
    throw new AppError("errAcknowledgeFirst");
  }
  return { campaign, participant };
}

/** Every referenced category, unit and system must exist in the organization and be usable. */
async function assertReferences(tx: Tx, campaign: AnalysisCampaign, input: ActivityInput) {
  const category = await tx.activityCategory.findFirst({
    where: {
      id: input.primaryCategoryId,
      organizationId: campaign.organizationId,
      active: true,
      OR: [{ departmentId: null }, { departmentId: campaign.departmentId }],
    },
  });
  if (!category) throw new AppError("errUnknownReference");
  if (input.volumeUnitId) {
    const unit = await tx.volumeUnit.findFirst({ where: { id: input.volumeUnitId, organizationId: campaign.organizationId, active: true } });
    if (!unit) throw new AppError("errUnknownReference");
  }
  if (input.systemIds.length > 0) {
    const count = await tx.systemReference.count({
      where: { id: { in: input.systemIds }, organizationId: campaign.organizationId, active: true },
    });
    if (count !== new Set(input.systemIds).size) throw new AppError("errUnknownReference");
  }
}

function versionFields(input: ActivityInput) {
  const { systemIds, primaryCategoryId, volumeUnitId, ...rest } = input;
  return {
    ...rest,
    primaryCategory: { connect: { id: primaryCategoryId } },
    ...(volumeUnitId ? { volumeUnit: { connect: { id: volumeUnitId } } } : {}),
    systems: { connect: [...new Set(systemIds)].map((id) => ({ id })) },
  };
}

async function createActivity(tx: Tx, actor: Actor, ctx: OwnContext, input: ActivityInput) {
  await assertReferences(tx, ctx.campaign, input);
  return tx.initialActivity.create({
    data: {
      campaignId: ctx.campaign.id,
      participantId: ctx.participant.id,
      versions: { create: { versionNumber: 1, isBaseline: false, createdById: actor.id, ...versionFields(input) } },
    },
  });
}

/**
 * Creates an activity (no activityId) or edits one. While the mapping is a draft,
 * version 1 is edited in place; once completed the baseline is never touched and an
 * edit adds a new version.
 */
export async function saveActivity(actor: Actor, campaignId: string, input: ActivityInput, activityId?: string) {
  const parsed = activityInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    if (!activityId) return createActivity(tx, actor, ctx, parsed);

    const activity = await tx.initialActivity.findFirst({
      where: { id: activityId, participantId: ctx.participant.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!activity) throw new AppError("errNotFound");
    await assertReferences(tx, ctx.campaign, parsed);

    const latest = activity.versions[0];
    const { systemIds, primaryCategoryId, volumeUnitId, ...rest } = parsed;
    if (!ctx.participant.mappingCompletedAt && !latest.isBaseline) {
      await tx.initialActivityVersion.update({
        where: { id: latest.id },
        data: {
          ...rest,
          primaryCategory: { connect: { id: primaryCategoryId } },
          volumeUnit: volumeUnitId ? { connect: { id: volumeUnitId } } : { disconnect: true },
          systems: { set: [...new Set(systemIds)].map((id) => ({ id })) },
        },
      });
    } else {
      await tx.initialActivityVersion.create({
        data: {
          activity: { connect: { id: activity.id } },
          versionNumber: latest.versionNumber + 1,
          isBaseline: false,
          createdById: actor.id,
          ...versionFields(parsed),
        },
      });
    }
    return activity;
  });
}

/** Draft activities only: after completion the baseline is kept. */
export async function deleteDraftActivity(actor: Actor, campaignId: string, activityId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    if (ctx.participant.mappingCompletedAt) throw new AppError("errMappingCompleted");
    const { count } = await tx.initialActivity.deleteMany({ where: { id: activityId, participantId: ctx.participant.id } });
    if (count === 0) throw new AppError("errNotFound");
  });
}

/** Completes Initial Mapping: every activity's first version becomes the immutable baseline. */
export async function completeMapping(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    if (ctx.participant.mappingCompletedAt) throw new AppError("errMappingCompleted");
    const count = await tx.initialActivity.count({ where: { participantId: ctx.participant.id } });
    if (count === 0) throw new AppError("errNoActivities");

    await tx.initialActivityVersion.updateMany({
      where: { activity: { participantId: ctx.participant.id }, versionNumber: 1 },
      data: { isBaseline: true },
    });
    await tx.campaignParticipant.update({ where: { id: ctx.participant.id }, data: { mappingCompletedAt: new Date() } });
    await writeAudit(tx, {
      organizationId: ctx.campaign.organizationId,
      departmentId: ctx.campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "mapping.completed",
      targetType: "CampaignParticipant",
      targetId: ctx.participant.id,
      metadata: { activityCount: count },
    });
  });
}

async function importReferences(tx: Tx, campaign: AnalysisCampaign, participantId: string) {
  const [categories, units, systems, existing] = await Promise.all([
    tx.activityCategory.findMany({
      where: { organizationId: campaign.organizationId, active: true, OR: [{ departmentId: null }, { departmentId: campaign.departmentId }] },
    }),
    tx.volumeUnit.findMany({ where: { organizationId: campaign.organizationId, active: true } }),
    tx.systemReference.findMany({ where: { organizationId: campaign.organizationId, active: true } }),
    tx.initialActivity.findMany({
      where: { participantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { name: true } } },
    }),
  ]);
  return {
    categories,
    units,
    systems,
    existingNames: existing.flatMap((a) => a.versions.map((v) => v.name)),
  };
}

/** Parses and validates an uploaded file for the actor's own mapping. Nothing is saved. */
export async function previewImport(actor: Actor, campaignId: string, file: { name: string; buffer: Buffer }) {
  const read = await readImportFile(file.buffer, file.name);
  if (!read.ok) throw new AppError(read.error);
  return db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    const refs = await importReferences(tx, ctx.campaign, ctx.participant.id);
    return parseImportRecords(read.records, refs);
  });
}

/** Saves previewed rows. Every row is validated again here; the client is not trusted. */
export async function importActivities(actor: Actor, campaignId: string, rows: unknown[]) {
  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) throw new AppError("errInvalidInput");
  const inputs = rows.map((r) => activityInputSchema.parse(r));
  return db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    for (const input of inputs) await createActivity(tx, actor, ctx, input);
    return inputs.length;
  });
}

export type { ImportRow };

/** The campaign an Employee is currently taking part in (one per department at most). */
export async function findOwnCampaign(actor: Actor) {
  if (actor.role !== "EMPLOYEE" || !actor.departmentId) return null;
  const campaign = await db.analysisCampaign.findFirst({
    where: {
      departmentId: actor.departmentId,
      status: { in: OBSERVATION_STATUSES },
      participants: { some: { userId: actor.id, status: "ACTIVE" } },
    },
  });
  return campaign ? syncCampaignStatus(campaign) : null;
}

const versionInclude = { primaryCategory: true, volumeUnit: true, systems: true } as const;

/** Everything the mapping page needs for the Employee's own mapping. */
export async function getOwnMapping(actor: Actor) {
  const campaign = await findOwnCampaign(actor);
  if (!campaign) return null;
  const [participant, acknowledgement] = await Promise.all([
    db.campaignParticipant.findUniqueOrThrow({ where: { campaignId_userId: { campaignId: campaign.id, userId: actor.id } } }),
    db.campaignAcknowledgement.findUnique({ where: { campaignId_userId: { campaignId: campaign.id, userId: actor.id } } }),
  ]);
  const activities = await db.initialActivity.findMany({
    where: { participantId: participant.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: versionInclude } },
    orderBy: { createdAt: "asc" },
  });
  return {
    campaign,
    participant,
    acknowledged: acknowledgement !== null,
    completed: participant.mappingCompletedAt !== null,
    canEdit: EDITABLE.includes(campaign.status) && acknowledgement !== null,
    activities: activities.map((a) => ({ id: a.id, version: a.versions[0] })),
  };
}

/** One of the Employee's own activities with its latest version and version count. */
export async function getOwnActivity(actor: Actor, activityId: string) {
  const mapping = await getOwnMapping(actor);
  if (!mapping) throw new AppError("errNotFound");
  const activity = await db.initialActivity.findFirst({
    where: { id: activityId, participantId: mapping.participant.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, include: versionInclude } },
  });
  if (!activity) throw new AppError("errNotFound");
  return { mapping, activity, latest: activity.versions[0] };
}
