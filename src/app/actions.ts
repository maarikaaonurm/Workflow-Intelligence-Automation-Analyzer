"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { devLoginEnabled, endSession, requireUser, startSession } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { normalizeLocale } from "@/lib/i18n/messages";
import { attempt } from "@/lib/action-helpers";
import { createDepartment } from "@/lib/services/departments";

export async function devLogin(formData: FormData) {
  if (!devLoginEnabled()) throw new Error("Development login is disabled");
  const userId = z.string().min(1).parse(formData.get("userId"));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new Error("Unknown user");
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function setLocale(formData: FormData) {
  const locale = normalizeLocale(String(formData.get("locale")));
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(String(formData.get("returnTo") ?? "/").startsWith("/") ? String(formData.get("returnTo")) : "/");
}

export async function createDepartmentAction(formData: FormData) {
  const { actor } = await requireUser();
  await attempt("/admin/departments", async () => {
    const name = z.string().trim().min(1).max(100).parse(formData.get("name"));
    await createDepartment(actor, name);
  });
}
