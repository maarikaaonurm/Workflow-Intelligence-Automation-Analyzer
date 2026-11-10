import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  discardTimer: vi.fn(),
  confirmDiary: vi.fn(),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  toggleFavorite: vi.fn(),
  logSharedMeeting: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  createEntryFromTimer: vi.fn(),
  createEntriesBatch: vi.fn(),
  createSharedMeeting: vi.fn(),
}));

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`redirect:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ actor: { id: "u", organizationId: "org", isOrgAdmin: false, departmentRole: "EMPLOYEE", departmentId: "acc" } }),
}));
vi.mock("@/lib/services/diary", () => mocks);

import {
  confirmDiaryAction,
  deleteEntryAction,
  discardTimerAction,
  quickAddAction,
  saveEntryAction,
  saveMeetingAction,
  startTimerAction,
  stopTimerAction,
} from "./diary-actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const run = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  return null;
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) (fn as any).mockReset().mockResolvedValue({});
});

describe("consequential diary actions need the confirmation step", () => {
  it("does not delete, discard the timer or confirm the diary without confirmed=yes", async () => {
    expect(await run(() => deleteEntryAction(form({ entryId: "e1" })))).toBe("/diary/confirm?action=delete&entryId=e1");
    expect(await run(() => discardTimerAction(form({ campaignId: "c1" })))).toBe("/diary/confirm?action=discardTimer");
    expect(await run(() => confirmDiaryAction(form({ campaignId: "c1" })))).toBe("/diary/confirm?action=confirmDiary");
    expect(mocks.deleteEntry).not.toHaveBeenCalled();
    expect(mocks.discardTimer).not.toHaveBeenCalled();
    expect(mocks.confirmDiary).not.toHaveBeenCalled();
  });

  it("runs them once confirmed", async () => {
    await run(() => deleteEntryAction(form({ entryId: "e1", confirmed: "yes" })));
    await run(() => discardTimerAction(form({ campaignId: "c1", confirmed: "yes" })));
    await run(() => confirmDiaryAction(form({ campaignId: "c1", confirmed: "yes" })));
    expect(mocks.deleteEntry).toHaveBeenCalledTimes(1);
    expect(mocks.discardTimer).toHaveBeenCalledTimes(1);
    expect(mocks.confirmDiary).toHaveBeenCalledTimes(1);
  });

  it("sends a refusal back with the message key", async () => {
    mocks.confirmDiary.mockRejectedValue(new AppError("errDiaryNotOpen"));
    expect(await run(() => confirmDiaryAction(form({ campaignId: "c1", confirmed: "yes" })))).toBe("/diary?error=errDiaryNotOpen");
  });
});

describe("timer actions", () => {
  it("stopping goes to the review form and does not save anything", async () => {
    expect(await run(() => stopTimerAction(form({ campaignId: "c1" })))).toBe("/diary/new?source=TIMER");
    expect(mocks.createEntry).not.toHaveBeenCalled();
    expect(mocks.createEntryFromTimer).not.toHaveBeenCalled();
  });

  it("starting reports a running timer on the timer page", async () => {
    mocks.startTimer.mockRejectedValue(new AppError("errTimerRunning"));
    expect(await run(() => startTimerAction(form({ campaignId: "c1", title: "x" })))).toBe("/diary/timer?error=errTimerRunning");
  });
});

describe("saving an entry", () => {
  const entryForm = (extra: Record<string, string> = {}) =>
    form({ campaignId: "c1", kind: "ACTIVITY", activityDate: "2026-11-20", title: "Checks", durationValue: "35", durationUnit: "minutes", ...extra });

  it("returns field errors in place and keeps what was typed", async () => {
    const state = await saveEntryAction({}, entryForm({ durationValue: "0" }));
    expect(state.error).toBe("errInvalidInput");
    expect(state.fields).toContain("durationMinutes");
    expect(state.values?.title).toBe("Checks");
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });

  it("creates a manual entry, a timer entry (which also removes the timer) and an edit through the right service call", async () => {
    expect(await run(() => saveEntryAction({}, entryForm()))).toBe("/diary");
    expect(mocks.createEntry.mock.calls[0][3]).toBe("MANUAL");
    await run(() => saveEntryAction({}, entryForm({ source: "TIMER" })));
    expect(mocks.createEntryFromTimer).toHaveBeenCalledTimes(1);
    await run(() => saveEntryAction({}, entryForm({ entryId: "e9" })));
    expect(mocks.updateEntry.mock.calls[0][1]).toBe("e9");
    await run(() => saveEntryAction({}, entryForm({ source: "LOG_AGAIN" })));
    expect(mocks.createEntry.mock.calls[1][3]).toBe("LOG_AGAIN");
  });

  it("shows a service refusal in the form", async () => {
    mocks.createEntry.mockRejectedValue(new AppError("errDiaryRetroLimit"));
    const state = await saveEntryAction({}, entryForm());
    expect(state).toMatchObject({ error: "errDiaryRetroLimit" });
    expect(state.values?.activityDate).toBe("2026-11-20");
  });
});

describe("quick add and meetings", () => {
  it("quick add sends every row to the batch service and returns the result", async () => {
    mocks.createEntriesBatch.mockResolvedValue({ saved: 1, errors: [{ index: 1, code: "errDiaryRetroLimit" }] });
    const rows = JSON.stringify([
      { initialActivityId: "a1", title: "", activityDate: "2026-11-20", durationValue: "30", durationUnit: "minutes", volume: "", volumeUnitId: "", outOfScope: "" },
      { initialActivityId: "", title: "New thing", activityDate: "2026-11-01", durationValue: "1", durationUnit: "hours", volume: "8", volumeUnitId: "u1", outOfScope: "on" },
    ]);
    const state = await quickAddAction({}, form({ campaignId: "c1", rows }));
    expect(state.result).toEqual({ saved: 1, errors: [{ index: 1, code: "errDiaryRetroLimit" }] });
    const sent = mocks.createEntriesBatch.mock.calls[0][2];
    expect(sent[0]).toMatchObject({ initialActivityId: "a1", durationMinutes: 30 });
    expect(sent[1]).toMatchObject({ initialActivityId: null, title: "New thing", durationMinutes: 60, volume: 8, outOfScope: true });
    expect((await quickAddAction({}, form({ campaignId: "c1", rows: "not json" }))).error).toBe("errInvalidInput");
  });

  it("a shared meeting is defined once; an individual meeting is just an entry", async () => {
    const meetingForm = (extra: Record<string, string> = {}) =>
      form({ campaignId: "c1", activityDate: "2026-11-20", title: "Sync", durationValue: "30", durationUnit: "minutes", meetingPurpose: "PLANNING", meetingRecurrence: "AD_HOC", ...extra });
    await run(() => saveMeetingAction({}, meetingForm({ shared: "on" })));
    expect(mocks.createSharedMeeting).toHaveBeenCalledTimes(1);
    expect(mocks.createEntry).not.toHaveBeenCalled();
    await run(() => saveMeetingAction({}, meetingForm()));
    expect(mocks.createEntry.mock.calls[0][3]).toBe("MEETING");
    const missing = await saveMeetingAction({}, meetingForm({ meetingPurpose: "" }));
    expect(missing.fields).toContain("meetingPurpose");
  });
});
