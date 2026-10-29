import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Actor, Role } from "./policy";

const COOKIE = "wia_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id when the token is authentic and unexpired. */
export function decodeSession(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < now) return null;
  return userId;
}

export function devLoginEnabled(): boolean {
  return process.env.ENABLE_DEV_LOGIN === "true";
}

export async function startSession(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export interface CurrentUser {
  actor: Actor;
  name: string;
  email: string;
  locale: string;
  departmentName: string | null;
}

/** Loads the signed-in user fresh from the database on every request. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const userId = decodeSession(token);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { active: true }, include: { department: true } } },
  });
  if (!user || !user.active) return null;

  const membership = user.memberships[0];
  const role: Role = user.isOrgAdmin ? "ADMIN" : (membership?.role ?? "EMPLOYEE");
  return {
    actor: {
      id: user.id,
      organizationId: user.organizationId,
      role,
      departmentId: user.isOrgAdmin ? null : (membership?.departmentId ?? null),
    },
    name: user.name,
    email: user.email,
    locale: user.locale,
    departmentName: membership?.department.name ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
