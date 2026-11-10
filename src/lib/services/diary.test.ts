import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { DiaryEntryInput } from "@/lib/diary/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
// In-memory stand-in for the Prisma client covering what the diary service touches. A transaction that
// throws is rolled back. Real constraints (CHECKs, unique indexes) are exercised on Railway.
type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  campaign: {} as Row,
  participants: [] as Row[],
  acknowledged: true,
  periods: [] as Row[],
  excluded: [] as Row[],
  activities: [] as Row[],
  entries: [] as Row[],
  timers: [] as Row[],
  favorites: [] as Row[],
  meetings: [] as Row[],
  confirmations: [] as Row[],
  audits: [] as Row[],
  nextId: 1,
}));

vi.mock("@/lib/db", () => {
  const participantOf = (e: Row) => store.participants.find((p) => p.id === e.participantId)!;
  const normalizeEntry = (id: string, data: Row): Row => {
    const { participant, initialActivity, volumeUnit, sharedMeeting, systems, ...rest } = data;
    const row: Row = { id, ...rest };
    if (participant?.connect) row.participantId = participant.connect.id;
    if (initialActivity !== undefined) row.initialActivityId = initialActivity?.connect ? initialActivity.connect.id : null;
    else if (!("initialActivityId" in row)) row.initialActivityId = null;
    if (volumeUnit !== undefined) row.volumeUnitId = volumeUnit?.connect ? volumeUnit.connect.id : null;
    else if (!("volumeUnitId" in row)) row.volumeUnitId = null;
    if (sharedMeeting?.connect) row.sharedMeetingId = sharedMeeting.connect.id;
    else if (!("sharedMeetingId" in row)) row.sharedMeetingId = null;
    if (systems) row.systems = (systems.connect ?? systems.set ?? []).map((s: Row) => ({ id: s.id }));
    if (!row.systems) row.systems = [];
    return row;
  };
  const tx = {
    analysisCampaign: { findUnique: async () => store.campaign },
    campaignParticipant: {
      findUniqueOrThrow: async ({ where }: { where: Row }) => {
        const { campaignId, userId } = where.campaignId_userId;
        const p = store.participants.find((x) => x.campaignId === campaignId && x.userId === userId)!;
        return { ...p, periods: store.periods.filter((x) => x.participantId === p.id), excludedDates: store.excluded.filter((x) => x.participantId === p.id) };
      },
      findUnique: async ({ where }: { where: Row }) => {
        const { campaignId, userId } = where.campaignId_userId;
        return store.participants.find((p) => p.campaignId === campaignId && p.userId === userId) ?? null;
      },
    },
    campaignAcknowledgement: { findUnique: async () => (store.acknowledged ? { id: "ack" } : null) },
    campaignParticipationPeriod: { findMany: async ({ where }: { where: Row }) => store.periods.filter((p) => p.participantId === where.participantId) },
    campaignParticipantExcludedDate: { findMany: async ({ where }: { where: Row }) => store.excluded.filter((p) => p.participantId === where.participantId) },
    initialActivity: {
      findMany: async ({ where }: { where: Row }) =>
        store.activities.filter((a) => a.participantId === where.participantId).map((a) => ({ ...a, versions: [{ name: a.name, avgDurationMinutes: 30, systems: [] }] })),
      findFirst: async ({ where }: { where: Row }) => {
        const a = store.activities.find((x) => x.id === where.id && x.participantId === where.participantId);
        return a ? { ...a, versions: [{ name: a.name }] } : null;
      },
    },
    volumeUnit: { findFirst: async () => ({ id: "unit1" }) },
    systemReference: { count: async ({ where }: { where: Row }) => (where.id.in as string[]).filter((id) => ["sys1", "sys2"].includes(id)).length },
    reminderPreference: { findUnique: async () => null },
    sharedMeeting: {
      findMany: async () => store.meetings,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `m${store.nextId++}`, ...data };
        store.meetings.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: Row }) => store.meetings.find((m) => m.id === where.id) ?? null,
    },
    diaryEntry: {
      findMany: async ({ where, select }: { where: Row; select?: Row }) => {
        const mine = store.entries.filter((e) => e.participantId === where.participantId && (!where.activityDate?.gte || e.activityDate >= where.activityDate.gte));
        return select ? [...new Map(mine.map((e) => [e.activityDate.toISOString(), { activityDate: e.activityDate }])).values()] : mine.map((e) => ({ ...e, volumeUnit: null }));
      },
      create: async ({ data }: { data: Row }) => {
        const row = normalizeEntry(`e${store.nextId++}`, data);
        store.entries.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Row }) => {
        const e = store.entries.find((x) => {
          if (where.id && x.id !== where.id) return false;
          if (where.participant?.userId && participantOf(x).userId !== where.participant.userId) return false;
          if (where.participantId && x.participantId !== where.participantId) return false;
          if (where.sharedMeetingId && x.sharedMeetingId !== where.sharedMeetingId) return false;
          return true;
        });
        return e ? { ...e, participant: participantOf(e) } : null;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const existing = store.entries.find((x) => x.id === where.id)!;
        return Object.assign(existing, normalizeEntry(existing.id, data), { id: existing.id, participantId: existing.participantId });
      },
      delete: async ({ where }: { where: Row }) => {
        store.entries = store.entries.filter((x) => x.id !== where.id);
      },
    },
    diaryTimer: {
      findUnique: async ({ where }: { where: Row }) => store.timers.find((t) => t.participantId === where.participantId) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `t${store.nextId++}`, startedAt: new Date(), stoppedAt: null, ...data };
        store.timers.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(store.timers.find((t) => t.id === where.id)!, data),
      deleteMany: async ({ where }: { where: Row }) => {
        store.timers = store.timers.filter((t) => t.participantId !== where.participantId);
      },
    },
    favoriteActivity: {
      findMany: async ({ where }: { where: Row }) => store.favorites.filter((f) => f.participantId === where.participantId),
      findUnique: async ({ where }: { where: Row }) =>
        store.favorites.find((f) => f.participantId === where.participantId_initialActivityId.participantId && f.initialActivityId === where.participantId_initialActivityId.initialActivityId) ?? null,
      create: async ({ data }: { data: Row }) => store.favorites.push({ id: `f${store.nextId++}`, ...data }),
      delete: async ({ where }: { where: Row }) => {
        store.favorites = store.favorites.filter((f) => f.id !== where.id);
      },
    },
    diaryConfirmation: {
      findUnique: async ({ where }: { where: Row }) => store.confirmations.find((c) => c.participantId === where.participantId) ?? null,
      upsert: async ({ where, create }: { where: Row; create: Row }) => {
        if (!store.confirmations.some((c) => c.participantId === where.participantId)) store.confirmations.push({ id: `c${store.nextId++}`, ...create });
      },
      deleteMany: async ({ where }: { where: Row }) => {
        store.confirmations = store.confirmations.filter((c) => c.participantId !== where.participantId);
      },
    },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  const snapshot = () =>
    structuredClone({ entries: store.entries, timers: store.timers, favorites: store.favorites, meetings: store.meetings, confirmations: store.confirmations, audits: store.audits });
  const db = {
    ...tx,
    $transaction: async (fn: (t: typeof tx) => unknown) => {
      const before = snapshot();
      try {
        return await fn(tx);
      } catch (e) {
        Object.assign(store, before);
        throw e;
      }
    },
  };
  return { db };
});

// The functions under test do not need the mapping service's campaign lookup
vi.mock("@/lib/services/mapping", () => ({ findOwnCampaign: async () => store.campaign }));

import {
  confirmDiary,
  createEntriesBatch,
  createEntry,
  createEntryFromTimer,
  createSharedMeeting,
  deleteEntry,
  discardTimer,
  getOwnDiary,
  logSharedMeeting,
  startTimer,
  stopTimer,
  toggleFavorite,
  updateEntry,
} from "./diary";

const actor = (id: string, isOrgAdmin: boolean, departmentRole: Actor["departmentRole"], departmentId: string | null): Actor => ({ id, organizationId: "org", isOrgAdmin, departmentRole, departmentId });
const employee = actor("emp", false, "EMPLOYEE", "acc");
const employee2 = actor("emp2", false, "EMPLOYEE", "acc");
const manager = actor("mgr", false, "MANAGER", "acc");
const adminManager = actor("am", true, "MANAGER", "acc");
const adminNoDepartment = actor("adm", true, null, null);

const entry = (over: Partial<DiaryEntryInput> = {}): DiaryEntryInput => ({
  kind: "ACTIVITY",
  activityDate: "2026-11-20",
  initialActivityId: null,
  title: "Ad hoc checks",
  durationMinutes: 35,
  startMinute: null,
  endMinute: null,
  systemIds: [],
  volume: null,
  volumeUnitId: null,
  condition: "NORMAL",
  interrupted: false,
  outOfScope: false,
  note: null,
  improvementOpportunity: false,
  employeeSuggestion: null,
  meetingPurpose: null,
  meetingRecurrence: null,
  ...over,
});
const meeting = (over: Partial<DiaryEntryInput> = {}) => entry({ kind: "MEETING", title: "Team sync", meetingPurpose: "INFORMATION_SHARING", meetingRecurrence: "RECURRING", ...over });

const addParticipant = (userId: string, extra: Row = {}) => {
  const participant = { id: `p-${userId}`, campaignId: "c1", userId, status: "ACTIVE", ...extra };
  store.participants.push(participant);
  store.periods.push({ participantId: participant.id, startDate: new Date("2026-11-09T00:00:00Z"), inactiveFrom: null });
  return participant;
};
const setNow = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow("2026-11-20T10:00:00Z");
  store.campaign = {
    id: "c1", organizationId: "org", departmentId: "acc", status: "ACTIVE", retrospectiveWindowDays: 3,
    startDate: new Date("2026-11-09T00:00:00Z"), endDate: new Date("2026-11-27T00:00:00Z"),
  };
  store.participants = [];
  store.periods = [];
  store.excluded = [];
  store.activities = [{ id: "act1", participantId: "p-emp", name: "Bank receipt review" }, { id: "act-other", participantId: "p-emp2", name: "Someone else's" }];
  store.entries = [];
  store.timers = [];
  store.favorites = [];
  store.meetings = [];
  store.confirmations = [];
  store.audits = [];
  store.acknowledged = true;
  store.nextId = 1;
  for (const u of ["emp", "emp2", "mgr", "am"]) addParticipant(u);
});
afterEach(() => vi.useRealTimers());

describe("creating entries", () => {
  it("logs a manual entry for a mapped activity, taking the name from the mapping", async () => {
    const e = await createEntry(employee, "c1", entry({ initialActivityId: "act1", title: "-", durationMinutes: 45, systemIds: ["sys1"], volume: 12, volumeUnitId: "unit1" }));
    expect(e).toMatchObject({ title: "Bank receipt review", initialActivityId: "act1", durationMinutes: 45, source: "MANUAL", participantId: "p-emp", campaignId: "c1", volumeUnitId: "unit1" });
    expect((e as any).systems).toEqual([{ id: "sys1" }]);
  });

  it("logs a new free-text activity without a mapping link, and never merges it silently", async () => {
    const e = await createEntry(employee, "c1", entry({ title: "Checked yesterday's SEB receipts" }));
    expect(e).toMatchObject({ title: "Checked yesterday's SEB receipts", initialActivityId: null });
    expect(store.entries).toHaveLength(1);
  });

  it("keeps the condition marker, interruption flag, out-of-scope flag, note, and improvement suggestion", async () => {
    const e = await createEntry(employee, "c1", entry({ condition: "WAITING", interrupted: true, outOfScope: true, note: "Waiting for the bank", improvementOpportunity: true, employeeSuggestion: "Automate it" }));
    expect(e).toMatchObject({ condition: "WAITING", interrupted: true, outOfScope: true, note: "Waiting for the bank", improvementOpportunity: true, employeeSuggestion: "Automate it" });
  });

  it("accepts overlapping explicit times (parallel work) without rejecting either entry", async () => {
    await createEntry(employee, "c1", entry({ title: "A", startMinute: 540, endMinute: 600, durationMinutes: 60 }));
    await createEntry(employee, "c1", entry({ title: "B", startMinute: 570, endMinute: 630, durationMinutes: 60 }));
    expect(store.entries).toHaveLength(2);
  });

  it("records the source: favorite, log again and quick add are kept apart from manual", async () => {
    await createEntry(employee, "c1", entry(), "FAVORITE");
    await createEntry(employee, "c1", entry(), "LOG_AGAIN");
    expect(store.entries.map((e) => e.source)).toEqual(["FAVORITE", "LOG_AGAIN"]);
  });

  it("requires About This Analysis to be acknowledged first and rejects invalid content", async () => {
    store.acknowledged = false;
    await expect(createEntry(employee, "c1", entry())).rejects.toMatchObject({ code: "errAcknowledgeFirst" });
    store.acknowledged = true;
    await expect(createEntry(employee, "c1", entry({ durationMinutes: 0 }))).rejects.toThrow();
    await expect(createEntry(employee, "c1", entry({ initialActivityId: "act-other" }))).rejects.toMatchObject({ code: "errNotFound" });
    await expect(createEntry(employee, "c1", entry({ systemIds: ["sys-unknown"] }))).rejects.toMatchObject({ code: "errUnknownReference" });
    expect(store.entries).toHaveLength(0);
  });
});

describe("retrospective window and the end of observation", () => {
  it("allows today and the window, refuses further back, the future and absent days", async () => {
    await createEntry(employee, "c1", entry({ activityDate: "2026-11-17" }));
    await expect(createEntry(employee, "c1", entry({ activityDate: "2026-11-16" }))).rejects.toMatchObject({ code: "errDiaryRetroLimit" });
    await expect(createEntry(employee, "c1", entry({ activityDate: "2026-11-21" }))).rejects.toMatchObject({ code: "errDiaryFuture" });
    store.excluded.push({ participantId: "p-emp", date: new Date("2026-11-19T00:00:00Z") });
    await expect(createEntry(employee, "c1", entry({ activityDate: "2026-11-19" }))).rejects.toMatchObject({ code: "errDiaryAbsentDate" });
    expect(store.entries).toHaveLength(1);
  });

  it("refuses days when the participant was not taking part (late join, stopped, inactive gap)", async () => {
    store.periods.find((p) => p.participantId === "p-emp2")!.startDate = new Date("2026-11-19T00:00:00Z");
    await expect(createEntry(employee2, "c1", entry({ activityDate: "2026-11-18" }))).rejects.toMatchObject({ code: "errDiaryNotParticipating" });
    store.participants.find((p) => p.id === "p-emp")!.status = "STOPPED";
    await expect(createEntry(employee, "c1", entry())).rejects.toMatchObject({ code: "errDiaryNotParticipating" });
  });

  it("refuses new entries once observation has ended, even within the retrospective window", async () => {
    setNow("2026-11-28T10:00:00Z");
    await expect(createEntry(employee, "c1", entry({ activityDate: "2026-11-27" }))).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    expect(store.entries).toHaveLength(0);
  });

  it("does not open before the campaign starts", async () => {
    store.campaign.status = "INITIAL_MAPPING";
    store.campaign.startDate = new Date("2026-11-25T00:00:00Z");
    await expect(createEntry(employee, "c1", entry())).rejects.toMatchObject({ code: "errDiaryNotOpen" });
  });
});

describe("authorization: each participant only touches their own diary", () => {
  it("lets a Department Manager and an Organization Admin + Manager who participate keep their own diary", async () => {
    await createEntry(manager, "c1", entry({ title: "Manager work" }));
    await createEntry(adminManager, "c1", entry({ title: "Admin-manager work" }));
    expect(store.entries.map((e) => [e.title, e.participantId])).toEqual([["Manager work", "p-mgr"], ["Admin-manager work", "p-am"]]);
  });

  it("refuses an Organization Admin without a department, and a manager who is not a participant", async () => {
    await expect(createEntry(adminNoDepartment, "c1", entry())).rejects.toMatchObject({ code: "errForbidden" });
    store.participants = store.participants.filter((p) => p.userId !== "mgr");
    await expect(createEntry(manager, "c1", entry())).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("makes someone else's entry look missing: no edit, no delete, not even by a manager", async () => {
    const e = await createEntry(employee, "c1", entry());
    await expect(updateEntry(employee2, e.id, entry({ title: "Hijack" }))).rejects.toMatchObject({ code: "errNotFound" });
    await expect(deleteEntry(manager, e.id)).rejects.toMatchObject({ code: "errNotFound" });
    await expect(updateEntry(adminManager, e.id, entry())).rejects.toMatchObject({ code: "errNotFound" });
    expect(store.entries[0].title).toBe("Ad hoc checks");
  });

  it("does not let a participant link someone else's mapped activity or favorite it", async () => {
    await expect(createEntry(employee, "c1", entry({ initialActivityId: "act-other" }))).rejects.toMatchObject({ code: "errNotFound" });
    await expect(toggleFavorite(employee, "c1", "act-other")).rejects.toMatchObject({ code: "errNotFound" });
  });
});

describe("editing, deleting and the Review Window", () => {
  it("edits and deletes during observation", async () => {
    const e = await createEntry(employee, "c1", entry());
    await updateEntry(employee, e.id, entry({ durationMinutes: 50, note: "fixed" }));
    expect(store.entries[0]).toMatchObject({ durationMinutes: 50, note: "fixed" });
    await deleteEntry(employee, e.id);
    expect(store.entries).toHaveLength(0);
  });

  it("allows only corrections in the Review Window: the date is fixed, deleting and new entries are refused", async () => {
    const e = await createEntry(employee, "c1", entry({ activityDate: "2026-11-20" }));
    setNow("2026-11-28T10:00:00Z");
    await updateEntry(employee, e.id, entry({ activityDate: "2026-11-20", durationMinutes: 40 }));
    expect(store.entries[0].durationMinutes).toBe(40);
    await expect(updateEntry(employee, e.id, entry({ activityDate: "2026-11-19" }))).rejects.toMatchObject({ code: "errDiaryDateFixed" });
    await expect(deleteEntry(employee, e.id)).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    await expect(createEntry(employee, "c1", entry({ activityDate: "2026-11-27" }))).rejects.toMatchObject({ code: "errDiaryNotOpen" });
  });

  it("changes nothing once the campaign is locked", async () => {
    const e = await createEntry(employee, "c1", entry());
    store.campaign.status = "LOCKED";
    await expect(updateEntry(employee, e.id, entry({ durationMinutes: 99 }))).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    await expect(deleteEntry(employee, e.id)).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    await expect(confirmDiary(employee, "c1")).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    expect(store.entries[0].durationMinutes).toBe(35);
  });
});

describe("Confirm My Diary", () => {
  it("confirms only during the Review Window, audited, and a manager who participates confirms their own diary", async () => {
    await expect(confirmDiary(employee, "c1")).rejects.toMatchObject({ code: "errDiaryNotOpen" });
    setNow("2026-11-28T10:00:00Z");
    await confirmDiary(employee, "c1");
    await confirmDiary(manager, "c1");
    await confirmDiary(adminManager, "c1");
    expect(store.confirmations.map((c) => c.participantId).sort()).toEqual(["p-am", "p-emp", "p-mgr"]);
    expect(store.audits.map((a) => a.action)).toEqual(["diary.confirmed", "diary.confirmed", "diary.confirmed"]);
  });

  it("is idempotent, is refused for non-participants, and is withdrawn by a later correction", async () => {
    const e = await createEntry(employee, "c1", entry());
    setNow("2026-11-28T10:00:00Z");
    await confirmDiary(employee, "c1");
    await confirmDiary(employee, "c1");
    expect(store.confirmations).toHaveLength(1);
    await expect(confirmDiary(adminNoDepartment, "c1")).rejects.toMatchObject({ code: "errForbidden" });

    await updateEntry(employee, e.id, entry({ durationMinutes: 36 }));
    expect(store.confirmations).toHaveLength(0);
  });
});

describe("timer", () => {
  it("starts one timer at a time and never stops itself", async () => {
    await startTimer(employee, "c1", { initialActivityId: "act1", title: "" });
    expect(store.timers[0]).toMatchObject({ title: "Bank receipt review", participantId: "p-emp", stoppedAt: null });
    await expect(startTimer(employee, "c1", { initialActivityId: null, title: "Other" })).rejects.toMatchObject({ code: "errTimerRunning" });
    setNow("2026-11-21T23:00:00Z"); // a day and a half later: still running, still not stopped
    expect(store.timers[0].stoppedAt).toBeNull();
  });

  it("stops without saving, then saves the reviewed duration as a TIMER entry and removes the timer", async () => {
    await startTimer(employee, "c1", { initialActivityId: null, title: "Reconciling" });
    setNow("2026-11-20T11:30:00Z");
    const stopped = await stopTimer(employee, "c1");
    expect(stopped.stoppedAt).toBeInstanceOf(Date);
    expect(store.entries).toHaveLength(0);

    const saved = await createEntryFromTimer(employee, "c1", entry({ title: "Reconciling", durationMinutes: 85 })); // adjusted by the participant
    expect(saved).toMatchObject({ source: "TIMER", durationMinutes: 85 });
    expect(store.timers).toHaveLength(0);
  });

  it("can be discarded, which saves nothing", async () => {
    await startTimer(employee, "c1", { initialActivityId: null, title: "Oops" });
    await discardTimer(employee, "c1");
    expect(store.timers).toHaveLength(0);
    expect(store.entries).toHaveLength(0);
    await expect(stopTimer(employee, "c1")).rejects.toMatchObject({ code: "errNoTimer" });
  });

  it("needs a name for a new activity and is only for the participant's own mapped activities", async () => {
    await expect(startTimer(employee, "c1", { initialActivityId: null, title: "  " })).rejects.toMatchObject({ code: "errInvalidInput" });
    await expect(startTimer(employee, "c1", { initialActivityId: "act-other", title: "" })).rejects.toMatchObject({ code: "errNotFound" });
  });

  it("does not run for someone who is not a participant, and each participant has their own timer", async () => {
    await expect(startTimer(adminNoDepartment, "c1", { initialActivityId: null, title: "x" })).rejects.toMatchObject({ code: "errForbidden" });
    await startTimer(employee, "c1", { initialActivityId: null, title: "Mine" });
    await startTimer(manager, "c1", { initialActivityId: null, title: "Theirs" });
    expect(store.timers.map((t) => t.participantId).sort()).toEqual(["p-emp", "p-mgr"]);
  });
});

describe("favorites", () => {
  it("toggles a mapped activity as a favorite for the participant only", async () => {
    await toggleFavorite(employee, "c1", "act1");
    expect(store.favorites).toHaveLength(1);
    expect(store.favorites[0]).toMatchObject({ participantId: "p-emp", initialActivityId: "act1" });
    await toggleFavorite(employee, "c1", "act1");
    expect(store.favorites).toHaveLength(0);
  });
});

describe("Quick Add", () => {
  it("saves the valid rows together and reports each invalid row with its error", async () => {
    const rows = [
      entry({ title: "Row one" }),
      entry({ title: "Row two", activityDate: "2026-11-10" }), // beyond the retrospective window
      { ...entry({ title: "Row three" }), durationMinutes: 0 }, // invalid
      entry({ initialActivityId: "act1", title: "-" }),
    ];
    const result = await createEntriesBatch(employee, "c1", rows);
    expect(result.saved).toBe(2);
    expect(result.errors).toEqual([
      { index: 1, code: "errDiaryRetroLimit" },
      { index: 2, code: "errInvalidInput" },
    ]);
    expect(store.entries.map((e) => e.title)).toEqual(["Row one", "Bank receipt review"]);
    expect(store.entries.every((e) => e.source === "QUICK_ADD")).toBe(true);
  });

  it("works for a manager who participates and is refused for anyone else", async () => {
    await createEntriesBatch(manager, "c1", [entry()]);
    expect(store.entries[0].participantId).toBe("p-mgr");
    await expect(createEntriesBatch(adminNoDepartment, "c1", [entry()])).rejects.toMatchObject({ code: "errForbidden" });
    await expect(createEntriesBatch(employee, "c1", [])).rejects.toMatchObject({ code: "errInvalidInput" });
  });
});

describe("meetings", () => {
  it("logs an individual meeting as a separate kind of entry", async () => {
    const e = await createEntry(employee, "c1", meeting());
    expect(e).toMatchObject({ kind: "MEETING", source: "MEETING", meetingPurpose: "INFORMATION_SHARING", meetingRecurrence: "RECURRING", initialActivityId: null });
    await expect(createEntry(employee, "c1", { ...meeting(), meetingPurpose: null })).rejects.toThrow();
  });

  it("defines a shared meeting once, adds it to the creator's diary and lets each other participant add it to their own, once", async () => {
    const m = await createSharedMeeting(employee, "c1", { title: "Close review", meetingDate: "2026-11-20", durationMinutes: 60, recurrence: "AD_HOC", purpose: "DECISION_MAKING", note: null });
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]).toMatchObject({ participantId: "p-emp", sharedMeetingId: m.id, kind: "MEETING" });

    await logSharedMeeting(employee2, m.id);
    await logSharedMeeting(manager, m.id);
    expect(store.entries.map((e) => e.participantId).sort()).toEqual(["p-emp", "p-emp2", "p-mgr"]);

    // never counted twice for the same participant
    await expect(logSharedMeeting(employee, m.id)).rejects.toMatchObject({ code: "errMeetingAlreadyLogged" });
    await expect(logSharedMeeting(employee2, m.id)).rejects.toMatchObject({ code: "errMeetingAlreadyLogged" });
    expect(store.entries).toHaveLength(3);
  });

  it("never writes into another participant's diary and is refused for non-participants", async () => {
    const m = await createSharedMeeting(employee, "c1", { title: "Sync", meetingDate: "2026-11-20", durationMinutes: 30, recurrence: "RECURRING", purpose: "PLANNING", note: null });
    expect(store.entries.filter((e) => e.participantId !== "p-emp")).toHaveLength(0);
    await expect(logSharedMeeting(adminNoDepartment, m.id)).rejects.toMatchObject({ code: "errForbidden" });
  });
});

describe("reading my diary", () => {
  it("returns only my entries, with out-of-scope time apart and coverage as context", async () => {
    await createEntry(employee, "c1", entry({ title: "Mine today", durationMinutes: 60 }));
    await createEntry(employee, "c1", entry({ title: "Training", durationMinutes: 120, outOfScope: true }));
    await createEntry(employee, "c1", entry({ title: "Yesterday", activityDate: "2026-11-19" }));
    await createEntry(employee2, "c1", entry({ title: "Colleague" }));
    await createEntry(manager, "c1", entry({ title: "Manager" }));

    const diary = (await getOwnDiary(employee))!;
    expect(diary.entries.map((e) => e.title).sort()).toEqual(["Mine today", "Training", "Yesterday"]);
    expect(diary.todayEntries).toHaveLength(2);
    const today = diary.days.find((d) => d.date === "2026-11-20")!;
    expect(today.totals).toMatchObject({ recorded: 60, outOfScope: 120 });
    expect(diary.coverage).toMatchObject({ daysWithEntries: 2 });
    expect(diary.perms).toEqual({ create: true, edit: true, delete: true, confirm: false });
    expect(diary.activities.map((a) => a.id)).toEqual(["act1"]); // my mapped activities only
  });

  it("shows a participating manager their own diary and nobody else's", async () => {
    await createEntry(employee, "c1", entry({ title: "Employee entry" }));
    await createEntry(manager, "c1", entry({ title: "Manager entry" }));
    const diary = (await getOwnDiary(manager))!;
    expect(diary.entries.map((e) => e.title)).toEqual(["Manager entry"]);
  });

  it("reports a running timer with its warning, and a due reminder when nothing is logged yet", async () => {
    await startTimer(employee, "c1", { initialActivityId: "act1", title: "" });
    setNow("2026-11-20T14:00:00Z"); // four hours on a 30-minute activity
    const diary = (await getOwnDiary(employee))!;
    expect(diary.timer).toMatchObject({ title: "Bank receipt review", warning: "exceedsActivity" });
    expect(diary.timer!.elapsed).toBe(240);
  });
});

