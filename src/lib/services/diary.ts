import { z } from "zod";
import type { AnalysisCampaign, CampaignParticipant, DiarySource, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { AppError, ForbiddenError } from "@/lib/errors";
import { coverage, fromISODate, todayISO, toISODate } from "@/lib/campaigns/dates";
import { autoTransition } from "@/lib/campaigns/status";
import { diaryEntrySchema, MEETING_PURPOSES, MEETING_RECURRENCES, type DiaryEntryInput } from "@/lib/diary/schema";
import { dayTotals, diaryPermissions, elapsedMinutes, timerWarning, validateEntryDate } from "@/lib/diary/rules";
import { findOwnCampaign } from "@/lib/services/mapping";

type Tx = Prisma.TransactionClient;
type Need = "create" | "edit" | "delete" | "confirm" | "read";

interface DiaryContext {
  campaign: AnalysisCampaign;
  participant: CampaignParticipant;
  status: ReturnType<typeof autoTransition>;
}

/**
 * Loads the actor's own participation for a diary operation and enforces the rules: own data only
 * (a Department Manager or Organization Admin who participates is treated like any participant),
 * About This Analysis acknowledged before creating, and what the campaign state allows.
 */
async function loadContext(tx: Tx, actor: Actor, campaignId: string, need: Need): Promise<DiaryContext> {
  const campaign = await tx.analysisCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError("errNotFound");
  const action = need === "confirm" ? "diary:confirm" : need === "read" ? "diary:read" : "diary:write";
  if (!can(actor, action, { organizationId: campaign.organizationId, departmentId: campaign.departmentId, ownerId: actor.id })) {
    throw new ForbiddenError();
  }
  const participant = await tx.campaignParticipant.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } });
  if (!participant) throw new ForbiddenError();

  // The calendar-corrected status, so an expired campaign is not writable even before anyone loaded it.
  const status = autoTransition(campaign.status, toISODate(campaign.startDate), toISODate(campaign.endDate), todayISO());
  if (need !== "read") {
    const perms = diaryPermissions(status);
    if (!perms[need]) throw new AppError("errDiaryNotOpen");
  }
  if (need === "create" && !(await tx.campaignAcknowledgement.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.id } } }))) {
    throw new AppError("errAcknowledgeFirst");
  }
  return { campaign, participant, status };
}

async function dateContext(tx: Tx, ctx: DiaryContext, date: string) {
  const [periods, excluded] = await Promise.all([
    tx.campaignParticipationPeriod.findMany({ where: { participantId: ctx.participant.id } }),
    tx.campaignParticipantExcludedDate.findMany({ where: { participantId: ctx.participant.id } }),
  ]);
  return {
    date,
    today: todayISO(),
    campaignStart: toISODate(ctx.campaign.startDate),
    campaignEnd: toISODate(ctx.campaign.endDate),
    retrospectiveWindowDays: ctx.campaign.retrospectiveWindowDays,
    periods: periods.map((p) => ({ start: toISODate(p.startDate), inactiveFrom: p.inactiveFrom ? toISODate(p.inactiveFrom) : null })),
    excludedDates: excluded.map((e) => toISODate(e.date)),
    participantStatus: ctx.participant.status,
  };
}

/** Linked activity (must be the participant's own), systems and unit must exist and be usable. */
async function resolveReferences(tx: Tx, ctx: DiaryContext, input: DiaryEntryInput): Promise<string> {
  let title = input.title;
  if (input.initialActivityId) {
    const activity = await tx.initialActivity.findFirst({
      where: { id: input.initialActivityId, participantId: ctx.participant.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { name: true } } },
    });
    if (!activity) throw new AppError("errNotFound");
    title = activity.versions[0]?.name ?? title;
  }
  if (input.volumeUnitId) {
    const unit = await tx.volumeUnit.findFirst({ where: { id: input.volumeUnitId, organizationId: ctx.campaign.organizationId, active: true } });
    if (!unit) throw new AppError("errUnknownReference");
  }
  if (input.systemIds.length > 0) {
    const count = await tx.systemReference.count({
      where: { id: { in: input.systemIds }, organizationId: ctx.campaign.organizationId, active: true },
    });
    if (count !== new Set(input.systemIds).size) throw new AppError("errUnknownReference");
  }
  return title;
}

function entryData(input: DiaryEntryInput, title: string) {
  const { systemIds, volumeUnitId, initialActivityId, activityDate, ...rest } = input;
  return {
    ...rest,
    title,
    activityDate: fromISODate(activityDate),
    ...(initialActivityId ? { initialActivity: { connect: { id: initialActivityId } } } : {}),
    ...(volumeUnitId ? { volumeUnit: { connect: { id: volumeUnitId } } } : {}),
    systems: { connect: [...new Set(systemIds)].map((id) => ({ id })) },
  };
}

async function createCore(
  tx: Tx,
  ctx: DiaryContext,
  input: DiaryEntryInput,
  source: DiarySource,
  extra: { sharedMeetingId?: string } = {},
) {
  const dateError = validateEntryDate(await dateContext(tx, ctx, input.activityDate));
  if (dateError) throw new AppError(dateError);
  const title = await resolveReferences(tx, ctx, input);
  const data: Prisma.DiaryEntryCreateInput = {
    ...entryData(input, title),
    campaignId: ctx.campaign.id,
    source,
    participant: { connect: { id: ctx.participant.id } },
    ...(extra.sharedMeetingId ? { sharedMeeting: { connect: { id: extra.sharedMeetingId } } } : {}),
  };
  return tx.diaryEntry.create({ data });
}

/** Creates one entry for the actor's own diary. */
export async function createEntry(actor: Actor, campaignId: string, input: DiaryEntryInput, source: DiarySource = "MANUAL") {
  const parsed = diaryEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    return createCore(tx, ctx, parsed, parsed.kind === "MEETING" ? "MEETING" : source);
  });
}

/** Saves the reviewed timer result as an entry and removes the timer, in one transaction. */
export async function createEntryFromTimer(actor: Actor, campaignId: string, input: DiaryEntryInput) {
  const parsed = diaryEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    const entry = await createCore(tx, ctx, parsed, "TIMER");
    await tx.diaryTimer.deleteMany({ where: { participantId: ctx.participant.id } });
    return entry;
  });
}

export interface BatchResult {
  saved: number;
  errors: { index: number; code: string }[];
}

/**
 * Quick Add: several entries at once. Every row is validated on its own; valid rows are saved
 * together and each invalid row is reported with its error, so nothing is lost silently.
 */
export async function createEntriesBatch(actor: Actor, campaignId: string, rows: unknown[]): Promise<BatchResult> {
  if (rows.length === 0 || rows.length > 50) throw new AppError("errInvalidInput");
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    const result: BatchResult = { saved: 0, errors: [] };
    for (const [index, row] of rows.entries()) {
      const parsed = diaryEntrySchema.safeParse(row);
      if (!parsed.success) {
        result.errors.push({ index, code: "errInvalidInput" });
        continue;
      }
      try {
        await createCore(tx, ctx, parsed.data, "QUICK_ADD");
        result.saved++;
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        result.errors.push({ index, code: e.code });
      }
    }
    return result;
  });
}

async function loadOwnEntry(tx: Tx, actor: Actor, entryId: string) {
  const entry = await tx.diaryEntry.findFirst({
    where: { id: entryId, participant: { userId: actor.id } },
    include: { participant: true },
  });
  // Someone else's entry looks exactly like a missing one.
  if (!entry) throw new AppError("errNotFound");
  return entry;
}

/** Edits an entry. During the Review Window the date is fixed; any edit after confirming withdraws the confirmation. */
export async function updateEntry(actor: Actor, entryId: string, input: DiaryEntryInput) {
  const parsed = diaryEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const entry = await loadOwnEntry(tx, actor, entryId);
    const ctx = await loadContext(tx, actor, entry.campaignId, "edit");
    const existingDate = toISODate(entry.activityDate);

    if (ctx.status === "REVIEW_WINDOW") {
      if (parsed.activityDate !== existingDate) throw new AppError("errDiaryDateFixed");
    } else if (parsed.activityDate !== existingDate) {
      const dateError = validateEntryDate(await dateContext(tx, ctx, parsed.activityDate));
      if (dateError) throw new AppError(dateError);
    }
    if (parsed.kind !== entry.kind) throw new AppError("errInvalidInput");
    const title = await resolveReferences(tx, ctx, parsed);
    const { systemIds, volumeUnitId, initialActivityId, activityDate, ...rest } = parsed;
    await tx.diaryEntry.update({
      where: { id: entryId },
      data: {
        ...rest,
        title,
        activityDate: fromISODate(activityDate),
        initialActivity: initialActivityId ? { connect: { id: initialActivityId } } : { disconnect: true },
        volumeUnit: volumeUnitId ? { connect: { id: volumeUnitId } } : { disconnect: true },
        systems: { set: [...new Set(systemIds)].map((id) => ({ id })) },
      },
    });
    await tx.diaryConfirmation.deleteMany({ where: { participantId: ctx.participant.id } });
  });
}

/** Deletes an entry; only while observation is running. */
export async function deleteEntry(actor: Actor, entryId: string) {
  await db.$transaction(async (tx) => {
    const entry = await loadOwnEntry(tx, actor, entryId);
    await loadContext(tx, actor, entry.campaignId, "delete");
    await tx.diaryEntry.delete({ where: { id: entryId } });
  });
}

// ---- Timer ----

const timerStartSchema = z.object({ initialActivityId: z.string().min(1).nullable(), title: z.string().trim().max(150) });

/** Starts the participant's timer. One at a time; it keeps running until the participant stops it. */
export async function startTimer(actor: Actor, campaignId: string, rawInput: z.infer<typeof timerStartSchema>) {
  const input = timerStartSchema.parse(rawInput);
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    if (await tx.diaryTimer.findUnique({ where: { participantId: ctx.participant.id } })) throw new AppError("errTimerRunning");
    let title = input.title;
    if (input.initialActivityId) {
      const activity = await tx.initialActivity.findFirst({
        where: { id: input.initialActivityId, participantId: ctx.participant.id },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { name: true } } },
      });
      if (!activity) throw new AppError("errNotFound");
      title = activity.versions[0]?.name ?? title;
    }
    if (title.trim() === "") throw new AppError("errInvalidInput");
    return tx.diaryTimer.create({
      data: { campaignId, participantId: ctx.participant.id, initialActivityId: input.initialActivityId, title },
    });
  });
}

/** Stops the timer so its duration can be reviewed and adjusted before saving. Nothing is saved yet. */
export async function stopTimer(actor: Actor, campaignId: string) {
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    const timer = await tx.diaryTimer.findUnique({ where: { participantId: ctx.participant.id } });
    if (!timer) throw new AppError("errNoTimer");
    return timer.stoppedAt ? timer : tx.diaryTimer.update({ where: { id: timer.id }, data: { stoppedAt: new Date() } });
  });
}

/** Throws the timer away without saving anything. */
export async function discardTimer(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "read");
    await tx.diaryTimer.deleteMany({ where: { participantId: ctx.participant.id } });
  });
}

// ---- Favorites ----

/** Marks or unmarks one of the participant's mapped activities as a favorite. */
export async function toggleFavorite(actor: Actor, campaignId: string, initialActivityId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "read");
    const activity = await tx.initialActivity.findFirst({ where: { id: initialActivityId, participantId: ctx.participant.id } });
    if (!activity) throw new AppError("errNotFound");
    const existing = await tx.favoriteActivity.findUnique({
      where: { participantId_initialActivityId: { participantId: ctx.participant.id, initialActivityId } },
    });
    if (existing) await tx.favoriteActivity.delete({ where: { id: existing.id } });
    else await tx.favoriteActivity.create({ data: { participantId: ctx.participant.id, initialActivityId } });
  });
}

// ---- Meetings ----

export const sharedMeetingSchema = z.object({
  title: z.string().trim().min(1).max(150),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().min(1).max(1440),
  recurrence: z.enum(MEETING_RECURRENCES),
  purpose: z.enum(MEETING_PURPOSES),
  note: z.string().trim().max(500).nullable(),
});
export type SharedMeetingInput = z.infer<typeof sharedMeetingSchema>;

function meetingEntry(meeting: { title: string; meetingDate: Date; durationMinutes: number; recurrence: DiaryEntryInput["meetingRecurrence"]; purpose: DiaryEntryInput["meetingPurpose"]; note: string | null }): DiaryEntryInput {
  return {
    kind: "MEETING",
    activityDate: toISODate(meeting.meetingDate),
    initialActivityId: null,
    title: meeting.title,
    durationMinutes: meeting.durationMinutes,
    startMinute: null,
    endMinute: null,
    systemIds: [],
    volume: null,
    volumeUnitId: null,
    condition: "NORMAL",
    interrupted: false,
    outOfScope: false,
    note: meeting.note,
    improvementOpportunity: false,
    employeeSuggestion: null,
    meetingPurpose: meeting.purpose,
    meetingRecurrence: meeting.recurrence,
  };
}

/**
 * Defines a meeting several participants attended and adds it to the creator's own diary. Others
 * add it to their own diary themselves (one entry each, never counted twice); nobody writes into
 * another person's diary.
 */
export async function createSharedMeeting(actor: Actor, campaignId: string, rawInput: SharedMeetingInput) {
  const input = sharedMeetingSchema.parse(rawInput);
  return db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "create");
    const dateError = validateEntryDate(await dateContext(tx, ctx, input.meetingDate));
    if (dateError) throw new AppError(dateError);
    const meeting = await tx.sharedMeeting.create({
      data: {
        campaignId,
        createdById: actor.id,
        title: input.title,
        meetingDate: fromISODate(input.meetingDate),
        durationMinutes: input.durationMinutes,
        recurrence: input.recurrence,
        purpose: input.purpose,
        note: input.note,
      },
    });
    await createCore(tx, ctx, meetingEntry(meeting), "MEETING", { sharedMeetingId: meeting.id });
    return meeting;
  });
}

/** Adds an existing shared meeting to the actor's own diary, once. */
export async function logSharedMeeting(actor: Actor, meetingId: string) {
  return db.$transaction(async (tx) => {
    const meeting = await tx.sharedMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new AppError("errNotFound");
    const ctx = await loadContext(tx, actor, meeting.campaignId, "create");
    if (await tx.diaryEntry.findFirst({ where: { participantId: ctx.participant.id, sharedMeetingId: meeting.id } })) {
      throw new AppError("errMeetingAlreadyLogged");
    }
    return createCore(tx, ctx, meetingEntry(meeting), "MEETING", { sharedMeetingId: meeting.id });
  });
}

// ---- Confirm My Diary ----

/** Confirms the participant's diary during the Review Window. Missing confirmations never block closing. */
export async function confirmDiary(actor: Actor, campaignId: string) {
  await db.$transaction(async (tx) => {
    const ctx = await loadContext(tx, actor, campaignId, "confirm");
    await tx.diaryConfirmation.upsert({
      where: { participantId: ctx.participant.id },
      update: {},
      create: { campaignId, participantId: ctx.participant.id },
    });
    await writeAudit(tx, {
      organizationId: ctx.campaign.organizationId,
      departmentId: ctx.campaign.departmentId,
      campaignId,
      actorId: actor.id,
      action: "diary.confirmed",
      targetType: "CampaignParticipant",
      targetId: ctx.participant.id,
    });
  });
}

// ---- Reading ----

/** True when a reminder should show: enabled, the time has passed today and nothing is logged yet. */
export function reminderDue(args: { enabled: boolean; time: string; nowHHMM: string; entriesToday: number; canCreate: boolean }): boolean {
  return args.enabled && args.canCreate && args.entriesToday === 0 && args.nowHHMM >= args.time;
}

function nowHHMM(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tallinn", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** Everything the diary pages need for the actor's own diary. Nothing of anyone else's. */
export async function getOwnDiary(actor: Actor, options: { days?: number | "all" } = {}) {
  const campaign = await findOwnCampaign(actor);
  if (!campaign) return null;
  const today = todayISO();
  const start = toISODate(campaign.startDate);
  const end = toISODate(campaign.endDate);

  const participant = await db.campaignParticipant.findUniqueOrThrow({
    where: { campaignId_userId: { campaignId: campaign.id, userId: actor.id } },
    include: { periods: true, excludedDates: true },
  });
  const status = autoTransition(campaign.status, start, end, today);
  const perms = diaryPermissions(status);
  const days = options.days ?? 14;
  const fromIso = days === "all" ? start : (() => {
    const d = new Date(`${today}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    const iso = d.toISOString().slice(0, 10);
    return iso < start ? start : iso;
  })();

  const [entries, allDates, activities, favorites, timer, confirmation, acknowledgement, reminder, meetings] = await Promise.all([
    db.diaryEntry.findMany({
      where: { participantId: participant.id, activityDate: { gte: fromISODate(fromIso) } },
      include: { systems: true, volumeUnit: true },
      orderBy: [{ activityDate: "desc" }, { createdAt: "desc" }],
    }),
    db.diaryEntry.findMany({ where: { participantId: participant.id }, select: { activityDate: true }, distinct: ["activityDate"] }),
    db.initialActivity.findMany({
      where: { participantId: participant.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { systems: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.favoriteActivity.findMany({ where: { participantId: participant.id } }),
    db.diaryTimer.findUnique({ where: { participantId: participant.id } }),
    db.diaryConfirmation.findUnique({ where: { participantId: participant.id } }),
    db.campaignAcknowledgement.findUnique({ where: { campaignId_userId: { campaignId: campaign.id, userId: actor.id } } }),
    db.reminderPreference.findUnique({ where: { campaignId_userId: { campaignId: campaign.id, userId: actor.id } } }),
    db.sharedMeeting.findMany({ where: { campaignId: campaign.id }, orderBy: { meetingDate: "desc" }, take: 30 }),
  ]);

  const periods = participant.periods.map((p) => ({ start: toISODate(p.startDate), inactiveFrom: p.inactiveFrom ? toISODate(p.inactiveFrom) : null }));
  const cov = coverage(
    { campaignStart: start, campaignEnd: end, periods, through: today },
    participant.excludedDates.map((d) => toISODate(d.date)),
    allDates.map((d) => toISODate(d.activityDate)),
  );

  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = toISODate(e.activityDate);
    byDate.set(key, [...(byDate.get(key) ?? []), e]);
  }
  const dayList = [...byDate.entries()].map(([date, list]) => ({ date, entries: list, totals: dayTotals(list) }));
  const todayEntries = byDate.get(today) ?? [];

  const loggedMeetingIds = new Set(entries.filter((e) => e.sharedMeetingId).map((e) => e.sharedMeetingId));
  const reminderTime = reminder?.time ?? campaign.reminderTime;
  const timerExpected = timer?.initialActivityId ? (activities.find((a) => a.id === timer.initialActivityId)?.versions[0]?.avgDurationMinutes ?? null) : null;
  const timerElapsed = timer ? elapsedMinutes(timer.startedAt, timer.stoppedAt ?? new Date()) : 0;

  return {
    campaign,
    participant,
    status,
    perms,
    acknowledged: acknowledgement !== null,
    today,
    daysRemaining: Math.max(0, Math.round((fromISODate(end).getTime() - fromISODate(today).getTime()) / 86_400_000)),
    coverage: cov,
    entries,
    days: dayList,
    todayEntries,
    todayMinutes: dayTotals(todayEntries).recorded,
    activities: activities.map((a) => ({ id: a.id, version: a.versions[0], favorite: favorites.some((f) => f.initialActivityId === a.id) })),
    favorites: activities.filter((a) => favorites.some((f) => f.initialActivityId === a.id)).map((a) => ({ id: a.id, version: a.versions[0] })),
    timer: timer ? { ...timer, elapsed: timerElapsed, warning: timerWarning({ elapsed: timerElapsed, expectedMinutes: timerExpected }), expectedMinutes: timerExpected } : null,
    confirmed: confirmation !== null,
    confirmedAt: confirmation?.confirmedAt ?? null,
    meetings: meetings.map((m) => ({ ...m, logged: loggedMeetingIds.has(m.id) })),
    reminder: {
      enabled: reminder?.enabled ?? true,
      time: reminderTime,
      due: reminderDue({ enabled: reminder?.enabled ?? true, time: reminderTime, nowHHMM: nowHHMM(), entriesToday: todayEntries.length, canCreate: perms.create && participant.status === "ACTIVE" }),
    },
  };
}

/** One of the actor's own entries, for editing and Log Again. Someone else's entry reads as not found. */
export async function getOwnEntry(actor: Actor, entryId: string) {
  const entry = await db.diaryEntry.findFirst({
    where: { id: entryId, participant: { userId: actor.id } },
    include: { systems: true },
  });
  if (!entry) throw new AppError("errNotFound");
  return entry;
}
