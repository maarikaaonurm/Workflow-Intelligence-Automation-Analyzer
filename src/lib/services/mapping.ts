import { randomUUID } from "node:crypto";
import { Prisma, type AnalysisCampaign, type CampaignParticipant } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import { todayISO, toISODate } from "@/lib/campaigns/dates";
import { autoTransition, OBSERVATION_STATUSES } from "@/lib/campaigns/status";
import { syncCampaignStatus } from "@/lib/services/campaigns";
import { activityInputSchema, type ActivityInput } from "@/lib/mapping/schema";
import {
  confirmationWarnings,
  MAX_IMPORT_ROWS,
  parseImportRecords,
  summarizeImport,
  type ImportReferences,
} from "@/lib/mapping/import";
import { readImportFile, sanitizeFilename, SUPPORTED_TEMPLATE_VERSIONS } from "@/lib/mapping/files";
import { baselineHash, contentHash } from "@/lib/mapping/baseline";
import { changedFields, mappingStatus, versionToInput } from "@/lib/mapping/present";
import { activityWarnings, type WarningCode } from "@/lib/mapping/warnings";
import type { Locale } from "@/lib/i18n/messages";

type Tx = Prisma.TransactionClient;

const EDITABLE = ["INITIAL_MAPPING", "ACTIVE"];

interface OwnContext {
  campaign: AnalysisCampaign;
  participant: CampaignParticipant;
}

/**
 * Loads the actor's own participation and enforces the rules for changing their
 * mapping: own data only, acknowledgement first, campaign still collecting. Neither
 * the manager role nor the Organization Admin privilege gives access to someone else's mapping.
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

export function versionFields(input: ActivityInput) {
  const { systemIds, primaryCategoryId, volumeUnitId, ...rest } = input;
  return {
    ...rest,
    primaryCategory: { connect: { id: primaryCategoryId } },
    ...(volumeUnitId ? { volumeUnit: { connect: { id: volumeUnitId } } } : {}),
    systems: { connect: [...new Set(systemIds)].map((id) => ({ id })) },
  };
}

const versionInclude = { primaryCategory: true, volumeUnit: true, systems: true } as const;

async function createActivity(
  tx: Tx,
  actor: Actor,
  ctx: OwnContext,
  input: ActivityInput,
  origin: { source: "DIRECT" | "IMPORT"; importBatchId?: string } = { source: "DIRECT" },
) {
  await assertReferences(tx, ctx.campaign, input);
  const existingCount = await tx.initialActivity.count({ where: { participantId: ctx.participant.id } });
  const activity = await tx.initialActivity.create({
    data: {
      campaignId: ctx.campaign.id,
      participantId: ctx.participant.id,
      source: origin.source,
      importBatchId: origin.importBatchId ?? null,
      versions: { create: { versionNumber: 1, isBaseline: false, createdById: actor.id, ...versionFields(input) } },
    },
  });
  const audit = { organizationId: ctx.campaign.organizationId, departmentId: ctx.campaign.departmentId, campaignId: ctx.campaign.id, actorId: actor.id };
  if (existingCount === 0 && !ctx.participant.mappingCompletedAt) {
    await writeAudit(tx, { ...audit, action: "mapping.started", targetType: "CampaignParticipant", targetId: ctx.participant.id });
  }
  // Ids and field names only: the activity text itself is never copied into the audit log.
  await writeAudit(tx, {
    ...audit,
    action: "mapping.activityCreated",
    targetType: "InitialActivity",
    targetId: activity.id,
    metadata: { source: origin.source },
  });
  return activity;
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
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { systems: true } } },
    });
    if (!activity) throw new AppError("errNotFound");
    await assertReferences(tx, ctx.campaign, parsed);

    const latest = activity.versions[0];
    const changed = changedFields(versionToInput(latest), parsed);
    const { systemIds, primaryCategoryId, volumeUnitId, ...rest } = parsed;
    const inPlace = !ctx.participant.mappingCompletedAt && !latest.isBaseline;
    if (inPlace) {
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
    if (changed.length > 0) {
      await writeAudit(tx, {
        organizationId: ctx.campaign.organizationId,
        departmentId: ctx.campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "mapping.activityUpdated",
        targetType: "InitialActivity",
        targetId: activity.id,
        metadata: { changed, newVersion: !inPlace, versionNumber: inPlace ? latest.versionNumber : latest.versionNumber + 1 },
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
    await writeAudit(tx, {
      organizationId: ctx.campaign.organizationId,
      departmentId: ctx.campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "mapping.activityDeleted",
      targetType: "InitialActivity",
      targetId: activityId,
    });
  });
}

export interface CompletionIssue {
  activityId: string;
  name: string;
  /** Message keys that must be fixed before completing. */
  errors: string[];
  warnings: WarningCode[];
}

/**
 * Validates every activity of the participant's mapping as it stands: schema rules,
 * references that may have become unavailable, and plausibility warnings.
 */
async function reviewActivities(tx: Tx, ctx: OwnContext): Promise<{ issues: CompletionIssue[]; versions: { activityId: string; content: ActivityInput }[] }> {
  const activities = await tx.initialActivity.findMany({
    where: { participantId: ctx.participant.id },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { systems: true } } },
  });
  const issues: CompletionIssue[] = [];
  const versions: { activityId: string; content: ActivityInput }[] = [];
  for (const activity of activities) {
    const version = activity.versions[0];
    const content = versionToInput(version);
    const errors: string[] = [];
    if (!activityInputSchema.safeParse(content).success) errors.push("errInvalidInput");
    try {
      await assertReferences(tx, ctx.campaign, content);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      errors.push("errCategoryInactive");
    }
    issues.push({ activityId: activity.id, name: version.name, errors, warnings: activityWarnings(content) });
    versions.push({ activityId: activity.id, content });
  }
  return { issues, versions };
}

/** What the completion confirmation shows: unresolved errors and warnings per activity. */
export async function getCompletionReview(actor: Actor, campaignId: string) {
  return db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    return (await reviewActivities(tx, ctx)).issues;
  });
}

/**
 * Completes Initial Mapping. Every activity is validated first; any error blocks completion.
 * Every activity's first version becomes the immutable baseline, and the baseline's identity
 * (a hash of those versions) is stored as the input-data version for later analysis.
 */
export async function completeMapping(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    if (ctx.participant.mappingCompletedAt) throw new AppError("errMappingCompleted");
    const { issues, versions } = await reviewActivities(tx, ctx);
    if (issues.length === 0) throw new AppError("errNoActivities");
    if (issues.some((i) => i.errors.length > 0)) throw new AppError("errMappingHasErrors");

    const hash = baselineHash(versions);
    await tx.initialActivityVersion.updateMany({
      where: { activity: { participantId: ctx.participant.id }, versionNumber: 1 },
      data: { isBaseline: true },
    });
    await tx.campaignParticipant.update({
      where: { id: ctx.participant.id },
      data: { mappingCompletedAt: new Date(), mappingBaselineHash: hash, mappingBaselineActivityCount: issues.length },
    });
    await writeAudit(tx, {
      organizationId: ctx.campaign.organizationId,
      departmentId: ctx.campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "mapping.completed",
      targetType: "CampaignParticipant",
      targetId: ctx.participant.id,
      metadata: {
        activityCount: issues.length,
        warningCount: issues.reduce((n, i) => n + i.warnings.length, 0),
        baselineHash: hash,
      },
    });
  });
}

async function importReferences(tx: Tx, campaign: AnalysisCampaign, participantId: string): Promise<ImportReferences> {
  const [categories, units, systems, existing] = await Promise.all([
    tx.activityCategory.findMany({
      where: { organizationId: campaign.organizationId, active: true, OR: [{ departmentId: null }, { departmentId: campaign.departmentId }] },
    }),
    tx.volumeUnit.findMany({ where: { organizationId: campaign.organizationId, active: true } }),
    tx.systemReference.findMany({ where: { organizationId: campaign.organizationId, active: true } }),
    tx.initialActivity.findMany({
      where: { participantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { name: true, description: true, primaryCategoryId: true } } },
    }),
  ]);
  return {
    categories,
    units,
    systems,
    existing: existing.flatMap((a) => a.versions.map((v) => ({ name: v.name, description: v.description, primaryCategoryId: v.primaryCategoryId }))),
  };
}

export interface ImportPreview {
  rows: ReturnType<typeof parseImportRecords>;
  summary: ReturnType<typeof summarizeImport>;
  templateVersion: string;
  templateLanguage: "et" | "en";
  filename: string;
  /** Identifies this preview: confirming it twice (refresh, double click, retry) imports once. */
  idempotencyKey: string;
  contentHash: string;
  existingCount: number;
  alreadyImportedAt: string | null;
}

/**
 * Parses and validates an uploaded template for the actor's own mapping and returns a preview.
 * Nothing is written: the file is read from memory, never stored, and the participant must confirm.
 */
export async function previewImport(actor: Actor, campaignId: string, file: { name: string; buffer: Buffer }, locale: Locale): Promise<ImportPreview> {
  const read = await readImportFile(file.buffer, file.name);
  if (!read.ok) throw new AppError(read.error);
  return db.$transaction(async (tx) => {
    const ctx = await loadOwnContext(tx, actor, campaignId);
    const refs = await importReferences(tx, ctx.campaign, ctx.participant.id);
    const rows = parseImportRecords(read.records, refs, locale);
    const hash = contentHash(rows.filter((r) => r.input).map((r) => r.input));
    const previous = await tx.initialMappingImportBatch.findFirst({ where: { participantId: ctx.participant.id, contentHash: hash } });
    return {
      rows,
      summary: summarizeImport(rows),
      templateVersion: read.templateVersion,
      templateLanguage: read.templateLanguage,
      filename: sanitizeFilename(file.name),
      idempotencyKey: randomUUID(),
      contentHash: hash,
      existingCount: refs.existing.length,
      alreadyImportedAt: previous ? previous.importedAt.toISOString() : null,
    };
  });
}

const importPayloadSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORT_ROWS),
  idempotencyKey: z.string().min(8).max(80),
  acceptedWarnings: z.boolean(),
  meta: z.object({
    templateVersion: z.string().max(20),
    templateLanguage: z.enum(["et", "en"]),
    filename: z.string().max(200),
    rowCount: z.number().int().min(0).max(MAX_IMPORT_ROWS),
    warningCount: z.number().int().min(0).max(MAX_IMPORT_ROWS),
    errorCount: z.number().int().min(0).max(MAX_IMPORT_ROWS),
  }),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

export interface ImportResult {
  batchId: string;
  created: number;
  /** True when this confirmation had already been applied; nothing was duplicated. */
  alreadyApplied: boolean;
}

/**
 * Writes the confirmed rows in ONE transaction. Every row is validated again here (the client is
 * not trusted), warnings must have been accepted, and the same preview or the same content cannot
 * be imported twice. A failure writes nothing and leaves the existing mapping untouched.
 */
export async function importActivities(actor: Actor, campaignId: string, rawPayload: unknown): Promise<ImportResult> {
  const payload = importPayloadSchema.parse(rawPayload);
  const inputs = payload.rows.map((r) => activityInputSchema.parse(r));
  if (!SUPPORTED_TEMPLATE_VERSIONS.includes(payload.meta.templateVersion)) throw new AppError("errImportTemplateVersion");

  const findBatch = async (participantId: string) =>
    db.initialMappingImportBatch.findUnique({ where: { participantId_idempotencyKey: { participantId, idempotencyKey: payload.idempotencyKey } } });

  try {
    return await db.$transaction(async (tx) => {
      const ctx = await loadOwnContext(tx, actor, campaignId);

      const already = await tx.initialMappingImportBatch.findUnique({
        where: { participantId_idempotencyKey: { participantId: ctx.participant.id, idempotencyKey: payload.idempotencyKey } },
      });
      if (already) return { batchId: already.id, created: already.successCount, alreadyApplied: true };

      const hash = contentHash(inputs);
      if (await tx.initialMappingImportBatch.findFirst({ where: { participantId: ctx.participant.id, contentHash: hash } })) {
        throw new AppError("errImportAlreadyImported");
      }
      const refs = await importReferences(tx, ctx.campaign, ctx.participant.id);
      if (confirmationWarnings(inputs, refs.existing) > 0 && !payload.acceptedWarnings) throw new AppError("errImportWarningsNotAccepted");

      const batch = await tx.initialMappingImportBatch.create({
        data: {
          campaignId,
          participantId: ctx.participant.id,
          idempotencyKey: payload.idempotencyKey,
          contentHash: hash,
          templateVersion: payload.meta.templateVersion,
          templateLanguage: payload.meta.templateLanguage,
          sourceFilename: sanitizeFilename(payload.meta.filename) || null,
          rowCount: Math.max(payload.meta.rowCount, inputs.length),
          successCount: inputs.length,
          warningCount: payload.meta.warningCount,
          errorCount: payload.meta.errorCount,
        },
      });
      for (const input of inputs) await createActivity(tx, actor, ctx, input, { source: "IMPORT", importBatchId: batch.id });
      await writeAudit(tx, {
        organizationId: ctx.campaign.organizationId,
        departmentId: ctx.campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "mapping.importConfirmed",
        targetType: "InitialMappingImportBatch",
        targetId: batch.id,
        // Counts and template identity only: no spreadsheet content.
        metadata: {
          created: inputs.length,
          warnings: payload.meta.warningCount,
          rowsWithErrors: payload.meta.errorCount,
          templateVersion: payload.meta.templateVersion,
          templateLanguage: payload.meta.templateLanguage,
        },
      });
      return { batchId: batch.id, created: inputs.length, alreadyApplied: false };
    });
  } catch (e) {
    // Two requests with the same key raced: the unique index let one win; the other reports it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const participant = await db.campaignParticipant.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } });
      const batch = participant ? await findBatch(participant.id) : null;
      if (batch) return { batchId: batch.id, created: batch.successCount, alreadyApplied: true };
    }
    // The transaction rolled back, so nothing was written; record only that the attempt failed.
    const campaign = await db.analysisCampaign.findUnique({ where: { id: campaignId } });
    if (campaign) {
      await db.auditLog.create({
        data: {
          organizationId: campaign.organizationId,
          departmentId: campaign.departmentId,
          campaignId,
          actorId: actor.id,
          action: "mapping.importFailed",
          targetType: "CampaignParticipant",
          metadata: { reason: e instanceof AppError ? e.code : "internal" },
        },
      });
    }
    throw e;
  }
}

/** The result of one of the actor's own import batches. */
export async function getOwnImportBatch(actor: Actor, batchId: string) {
  const batch = await db.initialMappingImportBatch.findFirst({ where: { id: batchId, participant: { userId: actor.id } } });
  if (!batch) throw new AppError("errNotFound");
  return batch;
}

/** The campaign an Employee is currently taking part in (one per department at most). */
export async function findOwnCampaign(actor: Actor) {
  // Participant functions belong to any department member (Employee or Department Manager).
  if (actor.departmentRole === null || !actor.departmentId) return null;
  const campaign = await db.analysisCampaign.findFirst({
    where: {
      departmentId: actor.departmentId,
      status: { in: OBSERVATION_STATUSES },
      participants: { some: { userId: actor.id, status: "ACTIVE" } },
    },
  });
  return campaign ? syncCampaignStatus(campaign) : null;
}

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
    status: mappingStatus({ activityCount: activities.length, completedAt: participant.mappingCompletedAt }),
    canEdit: EDITABLE.includes(campaign.status) && acknowledgement !== null,
    activities: activities.map((a) => ({ id: a.id, source: a.source, version: a.versions[0] })),
  };
}

/** One of the Employee's own activities with all its versions (original baseline first when read in order). */
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
