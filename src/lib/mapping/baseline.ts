import { createHash } from "node:crypto";

/** Recursively sorted JSON so the same content always hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/**
 * Identity of a completed baseline: the first version of every activity, ordered by activity id.
 * It identifies the input data that a later analysis compares the Activity Diary against.
 */
export function baselineHash(items: { activityId: string; content: unknown }[]): string {
  const ordered = [...items].sort((a, b) => (a.activityId < b.activityId ? -1 : 1));
  return contentHash(ordered.map((i) => ({ id: i.activityId, c: i.content })));
}
