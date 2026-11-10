"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { attempt, formString, safeReturnPath } from "@/lib/action-helpers";
import { createUser, deactivateUser, reactivateUser, setUserMembership, updateUser } from "@/lib/services/users";

const id = z.string().min(1);
const role = z.enum(["EMPLOYEE", "MANAGER"]);
const acknowledged = (f: FormData) => f.get("ackCampaigns") === "on";

/** Creates a brand-new user. From a department page, `departmentId` is preset and `returnTo` leads back there. */
export async function createUserAction(formData: FormData) {
  const { actor } = await requireUser();
  const returnTo = safeReturnPath(formString(formData, "returnTo"), "/admin/users");
  await attempt(returnTo, () =>
    createUser(
      actor,
      { firstName: formString(formData, "firstName"), lastName: formString(formData, "lastName"), email: formString(formData, "email") },
      { departmentId: formString(formData, "departmentId"), role: role.parse(formData.get("role")) },
    ).then(() => undefined),
  );
}

export async function updateUserAction(formData: FormData) {
  const { actor } = await requireUser();
  const userId = id.parse(formData.get("userId"));
  await attempt(`/admin/users/${userId}`, () =>
    updateUser(actor, userId, {
      firstName: formString(formData, "firstName"),
      lastName: formString(formData, "lastName"),
      email: formString(formData, "email"),
    }),
  );
}

/**
 * Adds, transfers or re-roles an existing user. This is the ONLY entry point for moving
 * an existing user between departments, and it runs only after the confirmation page
 * (/admin/membership/confirm) has added confirmed=yes. Campaign participation is never touched.
 */
export async function confirmMembershipAction(formData: FormData) {
  const { actor } = await requireUser();
  const userId = id.parse(formData.get("userId"));
  const departmentId = id.parse(formData.get("departmentId"));
  const memberRole = role.parse(formData.get("role"));
  const returnTo = safeReturnPath(formString(formData, "returnTo"), `/admin/users/${userId}`);

  const confirmPath =
    `/admin/membership/confirm?userId=${encodeURIComponent(userId)}&departmentId=${encodeURIComponent(departmentId)}` +
    `&role=${memberRole}&returnTo=${encodeURIComponent(returnTo)}`;
  if (formData.get("confirmed") !== "yes") redirect(confirmPath);

  await attempt(
    confirmPath,
    () => setUserMembership(actor, userId, { departmentId, role: memberRole }, acknowledged(formData)).then(() => undefined),
    returnTo,
  );
}

/** Deactivation is consequential: it only runs after the confirmation page adds confirmed=yes. */
export async function deactivateUserAction(formData: FormData) {
  const { actor } = await requireUser();
  const userId = id.parse(formData.get("userId"));
  if (formData.get("confirmed") !== "yes") redirect(`/admin/users/${userId}/confirm`);
  await attempt(`/admin/users/${userId}/confirm`, () => deactivateUser(actor, userId, acknowledged(formData)), `/admin/users/${userId}`);
}

export async function reactivateUserAction(formData: FormData) {
  const { actor } = await requireUser();
  const userId = id.parse(formData.get("userId"));
  await attempt(`/admin/users/${userId}`, () =>
    reactivateUser(actor, userId, { departmentId: formString(formData, "departmentId"), role: role.parse(formData.get("role")) }),
  );
}
