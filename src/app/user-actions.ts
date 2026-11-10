"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { attempt, formString } from "@/lib/action-helpers";
import { assignManager } from "@/lib/services/departments";
import { createUser, deactivateUser, reactivateUser, setUserMembership, updateUser } from "@/lib/services/users";

const id = z.string().min(1);
const role = z.enum(["EMPLOYEE", "MANAGER"]);
const acknowledged = (f: FormData) => f.get("ackCampaigns") === "on";

export async function createUserAction(formData: FormData) {
  const { actor } = await requireUser();
  await attempt("/admin/users", () =>
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

export async function setMembershipAction(formData: FormData) {
  const { actor } = await requireUser();
  const userId = id.parse(formData.get("userId"));
  await attempt(`/admin/users/${userId}`, () =>
    setUserMembership(
      actor,
      userId,
      { departmentId: formString(formData, "departmentId"), role: role.parse(formData.get("role")) },
      acknowledged(formData),
    ).then(() => undefined),
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

/** Assign or change a department's manager from any active user; the user is moved here if needed. */
export async function assignDepartmentManagerAction(formData: FormData) {
  const { actor } = await requireUser();
  const departmentId = id.parse(formData.get("departmentId"));
  const userId = id.parse(formData.get("userId"));
  await attempt(`/admin/departments/${departmentId}`, () =>
    assignManager(actor, departmentId, userId, acknowledged(formData)).then(() => undefined),
  );
}

/** Add a user to a department (moving them from their current one) as Employee or Manager. */
export async function addDepartmentMemberAction(formData: FormData) {
  const { actor } = await requireUser();
  const departmentId = id.parse(formData.get("departmentId"));
  const userId = id.parse(formData.get("userId"));
  await attempt(`/admin/departments/${departmentId}`, () =>
    setUserMembership(actor, userId, { departmentId, role: role.parse(formData.get("role")) }, acknowledged(formData)).then(() => undefined),
  );
}
