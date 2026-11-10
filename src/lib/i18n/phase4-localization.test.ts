import { describe, expect, it } from "vitest";
import { messages } from "./messages";
import { CONDITIONS, MEETING_PURPOSES, MEETING_RECURRENCES } from "@/lib/diary/schema";

const en = messages.en as Record<string, string>;
const et = messages.et as Record<string, string>;

const PREFIXES = ["dfield_", "cond", "rec", "purpose", "timer", "quick", "errDiary", "errTimer", "errNoTimer", "errMeeting", "diary", "coverage", "lockMissing"];
const SAME = new Set(["minutesShort", "dfield_kind"]);

describe("Phase 4 localization", () => {
  it("has an Estonian text for every Phase 4 text, and none is an English copy", () => {
    const keys = Object.keys(en).filter((k) => PREFIXES.some((p) => k.startsWith(p)));
    expect(keys.length).toBeGreaterThan(50);
    const bad = keys.filter((k) => !SAME.has(k) && (!et[k] || et[k] === en[k]));
    expect(bad).toEqual([]);
  });

  it("labels every controlled diary value in both languages", () => {
    for (const c of CONDITIONS) expect(et[`cond${c}`] && et[`cond${c}`] !== en[`cond${c}`]).toBeTruthy();
    for (const r of MEETING_RECURRENCES) expect(et[`rec${r}`] && et[`rec${r}`] !== en[`rec${r}`]).toBeTruthy();
    for (const p of MEETING_PURPOSES) expect(et[`purpose${p}`] && et[`purpose${p}`] !== en[`purpose${p}`]).toBeTruthy();
  });

  it("keeps the catalogs complete", () => {
    expect(Object.keys(et).sort()).toEqual(Object.keys(en).sort());
  });

  it("never describes the diary as a productivity measure", () => {
    const text = Object.entries(en).filter(([k]) => k.startsWith("coverage") || k.startsWith("diary")).map(([, v]) => v.toLowerCase()).join(" ");
    for (const word of ["score", "rank", "productivity", "leaderboard", "compliance"]) expect(text).not.toContain(word);
  });
});
