import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { decodeSession, encodeSession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
});

describe("session token", () => {
  it("round-trips a user id", () => {
    expect(decodeSession(encodeSession("user1"))).toBe("user1");
  });

  it("rejects a tampered token", () => {
    const token = encodeSession("user1");
    expect(decodeSession(token.replace("user1", "user2"))).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = encodeSession("user1", Date.now() - 1000 * 60 * 60 * 24);
    expect(decodeSession(token)).toBeNull();
  });
});
