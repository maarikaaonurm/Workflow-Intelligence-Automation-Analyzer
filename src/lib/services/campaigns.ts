import { Prisma, type AnalysisCampaign, type RemovalMode } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, managesDepartment, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  fromISODate,
  ISO_DATE,
  toISODate,
  todayISO,
  validateCampaignPeriod,
  validateEndDateChange,
} from "@/lib/campaigns/dates";
import { canRemoveParticipant, canRestoreParticipant, effectiveDate } from "@/lib/campaigns/participation";
import { autoTransition, canTransition, OBSERVATION_STATUSES, type CampaignStatus } from "@/lib/campaigns/status";

/** Bump when the "About This Analysis" text changes; stored with each acknowledgement. */
export const INFO_TEXT_VERSION = "2026-11-v1";

// Placeholder until organization-level retention settings exist (Phase 9).
const DEFAULT_RETENTION_SNAPSHOT = { diaryRetentionMonths: 12, postRetentionAction: "DELETE", source: "defaults-v0" };

const isoDate = z.string().regex(ISO_DATE);
const reminderTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const createCampaignSchema = z.object({
  departmentId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  startDate: isoDate,
  endDate: isoDate,
  reviewWindowDays: z.coerce.number().int(),
  retrospectiveWindowDays: z.coerce.number().int(),
  reminderTime,
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

type Tx = Prisma.TransactionClient;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function loadCampaign(tx: Tx, id: string): Promise<AnalysisCampaign> {
  const campaign = await tx.analysisCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError("errNotFound");
  return campaign;
}

/** Loads a campaign for a department-manager operation and enforces authorization. */
async function loadManaged(tx: Tx, actor: Actor, id: string): Promise<AnalysisCampaign> {
  const campaign = await loadCampaign(tx, id);
  if (!can(actor, "campaign:manage", campaign)) throw new ForbiddenError();
  return campaign;
}

function assertTransition(from: CampaignStatus, to: CampaignStatus) {
  if (!canTransition(from, to)) throw new AppError("errInvalidTransition");
}

export async function createCampaign(actor: Actor, input: CreateCampaignInput) {
  const department = await db.department.findUnique({ where: { id: input.departmentId } });
  // The resource must carry departmentId: passing the Department row itself (which has `id`) made a
  // Department Manager look like an outsider to their own department.
  if (!department || !can(actor, "campaign:create", { organizationId: department.organizationId, departmentId: department.id })) {
    throw new ForbiddenError();
  }

  const periodErrors = validateCampaignPeriod(input);
  if (periodErrors.length > 0) throw new AppError(periodErrors[0]);

  return db.$transaction(async (tx) => {
    const campaign = await tx.analysisCampaign.create({
      data: {
        organizationId: department.organizationId,
        departmentId: department.id,
        name: input.name,
        startDate: fromISODate(input.startDate),
        endDate: fromISODate(input.endDate),
        reviewWindowDays: input.reviewWindowDays,
        retrospectiveWindowDays: input.retrospectiveWindowDays,
        reminderTime: input.reminderTime,
        createdById: actor.id,
      },
    });
    // Default participants: every eligible active department member, the Department Manager
    // included (managers do operational work too). Organization privilege alone makes nobody
    // eligible: an Organization Admin is only included through their own department membership.
    const members = await tx.departmentMembership.findMany({
      where: { departmentId: department.id, active: true, user: { active: true } },
    });
    for (const m of members) {
      await tx.campaignParticipant.create({
        data: {
          campaignId: campaign.id,
          userId: m.userId,
          joinedAt: campaign.startDate,
          periods: { create: { startDate: campaign.startDate, startedKind: "INITIAL", startedById: actor.id } },
        },
      });
    }
    await writeAudit(tx, {
      organizationId: department.organizationId,
      departmentId: department.id,
      campaignId: campaign.id,
      actorId: actor.id,
      action: "campaign.created",
      targetType: "AnalysisCampaign",
      targetId: campaign.id,
      metadata: { participantCount: members.length },
    });
    return campaign;
  });
}

/**
 * Applies calendar-driven status changes (observation start, observation end).
 * Safe to call on every load: the update only applies if the status is unchanged.
 */
export async function syncCampaignStatus(campaign: AnalysisCampaign, today = todayISO()): Promise<AnalysisCampaign> {
  const next = autoTransition(campaign.status, toISODate(campaign.startDate), toISODate(campaign.endDate), today);
  if (next === campaign.status) return campaign;

  return db.$transaction(async (tx) => {
    const { count } = await tx.analysisCampaign.updateMany({
      where: { id: campaign.id, status: campaign.status },
      data: { status: next },
    });
    if (count === 1) {
      await writeAudit(tx, {
        organizationId: campaign.organizationId,
        departmentId: campaign.departmentId,
        campaignId: campaign.id,
        actorId: null,
        action: "campaign.statusChanged",
        targetType: "AnalysisCampaign",
        targetId: campaign.id,
        metadata: { from: campaign.status, to: next, trigger: "calendar" },
      });
    }
    return tx.analysisCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  });
}

export async function launchCampaign(actor: Actor, campaignId: string) {
  try {
    await db.$transaction(async (tx) => {
      const campaign = await loadManaged(tx, actor, campaignId);
      assertTransition(campaign.status, "INITIAL_MAPPING");
      if (toISODate(campaign.startDate) < todayISO()) throw new AppError("errStartInPast");

      const participants = await tx.campaignParticipant.count({ where: { campaignId, status: "ACTIVE" } });
      if (participants === 0) throw new AppError("errNoParticipants");

      const clash = await tx.analysisCampaign.findFirst({
        where: { departmentId: campaign.departmentId, status: { in: OBSERVATION_STATUSES }, id: { not: campaignId } },
      });
      if (clash) throw new AppError("errActiveCampaignExists");

      await tx.analysisCampaign.update({
        where: { id: campaignId },
        data: { status: "INITIAL_MAPPING", launchedAt: new Date(), retentionSnapshot: DEFAULT_RETENTION_SNAPSHOT },
      });
      await writeAudit(tx, {
        organizationId: campaign.organizationId,
        departmentId: campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "campaign.launched",
        targetType: "AnalysisCampaign",
        targetId: campaignId,
        metadata: { participantCount: participants },
      });
    });
  } catch (e) {
    // The partial unique index is the backstop for concurrent launches.
    if (isUniqueViolation(e)) throw new AppError("errActiveCampaignExists");
    throw e;
  }
  await syncCampaignStatus(await db.analysisCampaign.findUniqueOrThrow({ where: { id: campaignId } }));
}

export async function cancelCampaign(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    assertTransition(campaign.status, "CANCELLED");
    await tx.analysisCampaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.cancelled",
      targetType: "AnalysisCampaign",
      targetId: campaignId,
      metadata: { from: campaign.status },
    });
  });
}

/** Closes the campaign and locks its observation data. Missing confirmations do not block this. */
export async function lockCampaign(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    assertTransition(campaign.status, "LOCKED");
    await tx.analysisCampaign.update({ where: { id: campaignId }, data: { status: "LOCKED", lockedAt: new Date() } });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.locked",
      targetType: "AnalysisCampaign",
      targetId: campaignId,
    });
  });
}

/** Organization Admin only, and only with a reason. */
export async function reopenCampaign(actor: Actor, campaignId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 5) throw new AppError("errReasonRequired");
  try {
    await db.$transaction(async (tx) => {
      const campaign = await loadCampaign(tx, campaignId);
      if (!can(actor, "campaign:reopen", campaign)) throw new ForbiddenError();
      assertTransition(campaign.status, "REVIEW_WINDOW");
      const clash = await tx.analysisCampaign.findFirst({
        where: { departmentId: campaign.departmentId, status: { in: OBSERVATION_STATUSES }, id: { not: campaignId } },
      });
      if (clash) throw new AppError("errActiveCampaignExists");

      await tx.analysisCampaign.update({ where: { id: campaignId }, data: { status: "REVIEW_WINDOW", lockedAt: null } });
      await writeAudit(tx, {
        organizationId: campaign.organizationId,
        departmentId: campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "campaign.reopened",
        targetType: "AnalysisCampaign",
        targetId: campaignId,
        metadata: { reason: trimmed, from: campaign.status },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("errActiveCampaignExists");
    throw e;
  }
}

export async function changeEndDate(actor: Actor, campaignId: string, newEndDate: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    const error = validateEndDateChange({
      status: campaign.status,
      startDate: toISODate(campaign.startDate),
      newEndDate,
      today: todayISO(),
    });
    if (error) throw new AppError(error);

    const oldEndDate = toISODate(campaign.endDate);
    if (oldEndDate === newEndDate) return;
    await tx.analysisCampaign.update({ where: { id: campaignId }, data: { endDate: fromISODate(newEndDate) } });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.endDateChanged",
      targetType: "AnalysisCampaign",
      targetId: campaignId,
      metadata: { oldEndDate, newEndDate },
    });
  });
}

/** Adds a department Employee. Observation for a late participant starts today. */
export async function addParticipant(actor: Actor, campaignId: string, userId: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    if (!["DRAFT", "INITIAL_MAPPING", "ACTIVE"].includes(campaign.status)) throw new AppError("errCampaignClosed");

    const membership = await tx.departmentMembership.findFirst({
      where: { userId, departmentId: campaign.departmentId, active: true, user: { active: true } },
    });
    if (!membership) throw new AppError("errNotDepartmentEmployee");
    if (await tx.campaignParticipant.findUnique({ where: { campaignId_userId: { campaignId, userId } } })) {
      throw new AppError("errAlreadyParticipant");
    }

    const today = todayISO();
    const start = toISODate(campaign.startDate);
    const joinedAt = campaign.status === "DRAFT" || today < start ? campaign.startDate : fromISODate(today);
    const startedKind = campaign.status === "DRAFT" || today < start ? "INITIAL" : "LATE_JOIN";
    const participant = await tx.campaignParticipant.create({
      data: {
        campaignId,
        userId,
        joinedAt,
        periods: { create: { startDate: joinedAt, startedKind, startedById: actor.id } },
      },
    });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.participantAdded",
      targetType: "CampaignParticipant",
      targetId: participant.id,
      metadata: { userId, joinedAt: toISODate(joinedAt) },
    });
  });
}

/**
 * Before launch the participant row is simply deleted (no data exists yet). After
 * launch nothing is deleted: the open participation period is closed and the
 * participant is stopped (data stays in the analysis) or excluded (participant and
 * data are left out of the Final Analysis). Either can be undone with restoreParticipant.
 */
export async function removeParticipant(actor: Actor, campaignId: string, participantId: string, mode: RemovalMode) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    const participant = await tx.campaignParticipant.findFirst({ where: { id: participantId, campaignId } });
    if (!participant) throw new AppError("errNotFound");

    if (campaign.status === "DRAFT") {
      await tx.campaignParticipant.delete({ where: { id: participantId } });
      await writeAudit(tx, {
        organizationId: campaign.organizationId,
        departmentId: campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "campaign.participantRemoved",
        targetType: "CampaignParticipant",
        targetId: participantId,
        metadata: { userId: participant.userId, beforeLaunch: true },
      });
      return;
    }

    if (!canRemoveParticipant(campaign.status, participant.status)) {
      throw new AppError(participant.status === "ACTIVE" ? "errCampaignClosed" : "errAlreadyRemoved");
    }
    const open = await tx.campaignParticipationPeriod.findFirst({ where: { participantId, inactiveFrom: null } });
    if (!open) throw new Error("Active participant has no open participation period");

    const effective = effectiveDate(toISODate(campaign.startDate), todayISO());
    const inactiveFrom = effective < toISODate(open.startDate) ? open.startDate : fromISODate(effective);
    const now = new Date();
    await tx.campaignParticipationPeriod.update({
      where: { id: open.id },
      data: { inactiveFrom, endMode: mode, endedById: actor.id, endedAt: now },
    });
    await tx.campaignParticipant.update({
      where: { id: participantId },
      data: { status: mode === "EXCLUDE_DATA" ? "EXCLUDED" : "STOPPED", removedAt: now, removedById: actor.id },
    });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.participantRemoved",
      targetType: "CampaignParticipant",
      targetId: participantId,
      metadata: { mode, userId: participant.userId, inactiveFrom: toISODate(inactiveFrom), beforeLaunch: false },
    });
  });
}

/**
 * Restores a stopped or excluded participant by opening a NEW participation period
 * starting on the effective date. Earlier periods, the removal mode and the audit
 * trail are kept; the inactive gap never counts as expected or missing diary days.
 * Not allowed once the campaign is locked.
 */
export async function restoreParticipant(actor: Actor, campaignId: string, participantId: string) {
  try {
    await db.$transaction(async (tx) => {
      const campaign = await loadManaged(tx, actor, campaignId);
      const participant = await tx.campaignParticipant.findFirst({ where: { id: participantId, campaignId } });
      if (!participant) throw new AppError("errNotFound");
      if (participant.status === "ACTIVE") throw new AppError("errNotRemoved");
      if (!canRestoreParticipant(campaign.status, participant.status)) throw new AppError("errCampaignClosed");

      const membership = await tx.departmentMembership.findFirst({
        where: {
          userId: participant.userId,
          departmentId: campaign.departmentId,
          active: true,
          user: { active: true },
        },
      });
      if (!membership) throw new AppError("errNotDepartmentEmployee");

      const previous = await tx.campaignParticipationPeriod.findFirst({
        where: { participantId },
        orderBy: [{ startDate: "desc" }, { startedAt: "desc" }],
      });
      const restoredFrom = effectiveDate(toISODate(campaign.startDate), todayISO());
      await tx.campaignParticipationPeriod.create({
        data: { participantId, startDate: fromISODate(restoredFrom), startedKind: "RESTORED", startedById: actor.id },
      });
      await tx.campaignParticipant.update({
        where: { id: participantId },
        data: { status: "ACTIVE", removedAt: null, removedById: null },
      });
      await writeAudit(tx, {
        organizationId: campaign.organizationId,
        departmentId: campaign.departmentId,
        campaignId,
        actorId: actor.id,
        action: "campaign.participantRestored",
        targetType: "CampaignParticipant",
        targetId: participantId,
        metadata: {
          userId: participant.userId,
          restoredFrom,
          previousStatus: participant.status,
          previousMode: previous?.endMode ?? null,
          previousInactiveFrom: previous?.inactiveFrom ? toISODate(previous.inactiveFrom) : null,
        },
      });
    });
  } catch (e) {
    // The partial unique index allows only one open period: a concurrent restore lost the race.
    if (isUniqueViolation(e)) throw new AppError("errNotRemoved");
    throw e;
  }
}

/** Marks a date Out of Scope / Absent for a participant. No reason is collected. */
export async function setExcludedDate(actor: Actor, campaignId: string, participantId: string, date: string) {
  if (!ISO_DATE.test(date)) throw new AppError("errInvalidDate");
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    if (date < toISODate(campaign.startDate) || date > toISODate(campaign.endDate)) throw new AppError("errDateOutsideCampaign");
    const participant = await tx.campaignParticipant.findFirst({ where: { id: participantId, campaignId } });
    if (!participant) throw new AppError("errNotFound");

    const row = await tx.campaignParticipantExcludedDate.upsert({
      where: { participantId_date: { participantId, date: fromISODate(date) } },
      update: {},
      create: { participantId, date: fromISODate(date), createdById: actor.id },
    });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.excludedDateSet",
      targetType: "CampaignParticipantExcludedDate",
      targetId: row.id,
      metadata: { participantId, date },
    });
  });
}

export async function clearExcludedDate(actor: Actor, campaignId: string, excludedDateId: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadManaged(tx, actor, campaignId);
    const row = await tx.campaignParticipantExcludedDate.findFirst({
      where: { id: excludedDateId, participant: { campaignId } },
    });
    if (!row) throw new AppError("errNotFound");
    await tx.campaignParticipantExcludedDate.delete({ where: { id: excludedDateId } });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.excludedDateCleared",
      targetType: "CampaignParticipantExcludedDate",
      targetId: excludedDateId,
      metadata: { participantId: row.participantId, date: toISODate(row.date) },
    });
  });
}

/** Records that an Employee read "About This Analysis". Informational, not legal consent. */
export async function acknowledgeAbout(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const campaign = await loadCampaign(tx, campaignId);
    if (!can(actor, "campaign:acknowledge", campaign)) throw new ForbiddenError();
    const participant = await tx.campaignParticipant.findUnique({
      where: { campaignId_userId: { campaignId, userId: actor.id } },
    });
    if (!participant || participant.status !== "ACTIVE") throw new ForbiddenError();
    if (!["INITIAL_MAPPING", "ACTIVE"].includes(campaign.status)) throw new AppError("errCampaignClosed");

    await tx.campaignAcknowledgement.upsert({
      where: { campaignId_userId: { campaignId, userId: actor.id } },
      update: {},
      create: { campaignId, userId: actor.id, textVersion: INFO_TEXT_VERSION },
    });
    await writeAudit(tx, {
      organizationId: campaign.organizationId,
      departmentId: campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "campaign.acknowledged",
      targetType: "CampaignAcknowledgement",
      metadata: { textVersion: INFO_TEXT_VERSION },
    });
  });
}

/** An Employee's own reminder setting for a campaign they participate in. */
export async function setReminderPreference(actor: Actor, campaignId: string, time: string, enabled: boolean) {
  if (!reminderTime.safeParse(time).success) throw new AppError("errInvalidTime");
  const campaign = await db.analysisCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !can(actor, "campaign:acknowledge", campaign)) throw new ForbiddenError();
  const participant = await db.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: actor.id } },
  });
  if (!participant) throw new ForbiddenError();

  await db.reminderPreference.upsert({
    where: { campaignId_userId: { campaignId, userId: actor.id } },
    update: { time, enabled },
    create: { campaignId, userId: actor.id, time, enabled },
  });
}

/** Drafts are visible to the department's manager and to Organization Admins only. */
function canSeeDraft(actor: Actor, campaign: { departmentId: string }): boolean {
  return actor.isOrgAdmin || managesDepartment(actor, campaign.departmentId);
}

export async function listCampaigns(actor: Actor) {
  const campaigns = await db.analysisCampaign.findMany({
    where:
      actor.isOrgAdmin
        ? { organizationId: actor.organizationId }
        : { organizationId: actor.organizationId, departmentId: actor.departmentId ?? "none" },
    include: { department: true },
    orderBy: { createdAt: "desc" },
  });
  const visible = campaigns.filter((c) => c.status !== "DRAFT" || canSeeDraft(actor, c));
  return Promise.all(visible.map(async (c) => ({ ...(await syncCampaignStatus(c)), department: c.department })));
}

/** Everything the campaign page needs, shaped by what the actor is allowed to see. */
export async function getCampaignDetail(actor: Actor, campaignId: string) {
  const found = await db.analysisCampaign.findUnique({ where: { id: campaignId }, include: { department: true } });
  if (!found || !can(actor, "campaign:view", found)) throw new AppError("errNotFound");
  if (found.status === "DRAFT" && !canSeeDraft(actor, found)) throw new AppError("errNotFound");
  const campaign = await syncCampaignStatus(found);

  const canManage = can(actor, "campaign:manage", campaign);
  const [participants, acknowledgementCount, endDateChanges, own] = await Promise.all([
    db.campaignParticipant.findMany({
      where: { campaignId },
      include: { user: true, excludedDates: { orderBy: { date: "asc" } }, periods: { orderBy: { startDate: "asc" } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.campaignAcknowledgement.count({ where: { campaignId } }),
    db.auditLog.findMany({
      where: { campaignId, action: "campaign.endDateChanged" },
      orderBy: { createdAt: "asc" },
    }),
    // Participant data: only the actor's own record, whatever their department role is.
    actor.departmentRole !== null && actor.departmentId === found.departmentId
      ? Promise.all([
          db.campaignParticipant.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } }),
          db.campaignAcknowledgement.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } }),
          db.reminderPreference.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } }),
        ])
      : null,
  ]);

  const dept = await db.departmentMembership.findMany({
    where: { departmentId: campaign.departmentId, active: true, user: { active: true } },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  const participantIds = new Set(participants.map((p) => p.userId));

  return {
    campaign: { ...campaign, department: found.department },
    canManage,
    canReopen: can(actor, "campaign:reopen", campaign),
    // Names and per-person data only for the authorized manager view.
    participants: canManage ? participants : [],
    participantCount: participants.filter((p) => p.status === "ACTIVE").length,
    mappingCompletedCount: participants.filter((p) => p.status === "ACTIVE" && p.mappingCompletedAt !== null).length,
    acknowledgementCount,
    addableMembers: canManage ? dept.filter((m) => !participantIds.has(m.userId)).map((m) => m.user) : [],
    endDateChanges: endDateChanges.map((a) => {
      const m = a.metadata as { oldEndDate: string; newEndDate: string };
      return { at: a.createdAt, oldEndDate: m.oldEndDate, newEndDate: m.newEndDate };
    }),
    // Present only when the actor really is a participant, so a manager who is not taking part sees no participant area.
    own: own && own[0] ? { participant: own[0], acknowledgement: own[1], reminder: own[2] } : null,
  };
}
