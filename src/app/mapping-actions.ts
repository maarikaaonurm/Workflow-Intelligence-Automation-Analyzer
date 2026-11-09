"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { parseActivityForm } from "@/lib/mapping/form";
import type { ActivityInput } from "@/lib/mapping/schema";
import type { ImportRow } from "@/lib/mapping/import";
import {
  completeMapping,
  deleteDraftActivity,
  importActivities,
  previewImport,
  saveActivity,
} from "@/lib/services/mapping";
import {
  categorySchema,
  createCategory,
  createSystem,
  createUnit,
  loadStandardReferenceData,
  setReferenceActive,
  systemSchema,
  unitSchema,
} from "@/lib/services/reference";

export interface ActivityFormState {
  error?: string;
  fields?: string[];
  /** Submitted values, so the form can be shown again without losing input. */
  values?: Record<string, string | string[]>;
}

function submittedValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    values[key] = all.length > 1 || key === "systemIds" || key === "sensitiveData" ? all : (all[0] ?? "");
  }
  return values;
}

/** Create or edit an activity. Returns form errors in state; redirects to the list on success. */
export async function saveActivityAction(_prev: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const activityId = String(formData.get("activityId") ?? "") || undefined;

  const parsed = parseActivityForm(formData);
  if (!parsed.ok) return { error: "errInvalidInput", fields: parsed.fields, values: submittedValues(formData) };

  try {
    await saveActivity(actor, campaignId, parsed.input, activityId);
  } catch (e) {
    if (e instanceof AppError) return { error: e.code, values: submittedValues(formData) };
    throw e;
  }
  redirect("/mapping");
}

export async function completeMappingAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  if (formData.get("confirmed") !== "yes") redirect("/mapping/confirm?action=complete");
  try {
    await completeMapping(actor, campaignId);
  } catch (e) {
    if (e instanceof AppError) redirect(`/mapping?error=${e.code}`);
    throw e;
  }
  redirect("/mapping");
}

export async function deleteActivityAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const activityId = z.string().min(1).parse(formData.get("activityId"));
  if (formData.get("confirmed") !== "yes") redirect(`/mapping/confirm?action=delete&activityId=${activityId}`);
  try {
    await deleteDraftActivity(actor, campaignId, activityId);
  } catch (e) {
    if (e instanceof AppError) redirect(`/mapping?error=${e.code}`);
    throw e;
  }
  redirect("/mapping");
}

export interface ImportPreviewState {
  error?: string;
  rows?: ImportRow[];
  campaignId?: string;
}

export async function previewImportAction(_prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "errImportNoFile" };
  try {
    const rows = await previewImport(actor, campaignId, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    return { rows, campaignId };
  } catch (e) {
    if (e instanceof AppError) return { error: e.code };
    throw e;
  }
}

export async function confirmImportAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    redirect("/mapping/import?error=errInvalidInput");
  }
  try {
    await importActivities(actor, campaignId, Array.isArray(rows) ? (rows as ActivityInput[]) : []);
  } catch (e) {
    if (e instanceof AppError || e instanceof z.ZodError) {
      redirect(`/mapping/import?error=${e instanceof AppError ? e.code : "errInvalidInput"}`);
    }
    throw e;
  }
  redirect("/mapping");
}

// ---- Organization Admin: reference data ----

async function adminAttempt(fn: () => Promise<void>): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) redirect(`/admin/reference?error=${e.code}`);
    if (e instanceof z.ZodError) redirect("/admin/reference?error=errInvalidInput");
    throw e;
  }
  redirect("/admin/reference");
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const optional = (f: FormData, k: string) => (str(f, k).trim() === "" ? null : str(f, k));

export async function loadStandardDataAction() {
  const { actor } = await requireUser();
  await adminAttempt(() => loadStandardReferenceData(actor));
}

export async function createCategoryAction(formData: FormData) {
  const { actor } = await requireUser();
  await adminAttempt(() =>
    createCategory(
      actor,
      categorySchema.parse({
        departmentId: optional(formData, "departmentId"),
        nameEn: str(formData, "nameEn"),
        nameEt: str(formData, "nameEt"),
        definition: str(formData, "definition"),
        belongsHere: str(formData, "belongsHere"),
        notBelongsHere: str(formData, "notBelongsHere"),
        boundaryExamples: optional(formData, "boundaryExamples"),
      }),
    ),
  );
}

export async function createUnitAction(formData: FormData) {
  const { actor } = await requireUser();
  await adminAttempt(() =>
    createUnit(actor, unitSchema.parse({ key: str(formData, "key"), nameEn: str(formData, "nameEn"), nameEt: str(formData, "nameEt") })),
  );
}

export async function createSystemAction(formData: FormData) {
  const { actor } = await requireUser();
  await adminAttempt(() => createSystem(actor, systemSchema.parse({ name: str(formData, "name") })));
}

export async function setReferenceActiveAction(formData: FormData) {
  const { actor } = await requireUser();
  const kind = z.enum(["category", "unit", "system"]).parse(formData.get("kind"));
  const id = z.string().min(1).parse(formData.get("id"));
  const active = formData.get("active") === "true";
  await adminAttempt(() => setReferenceActive(actor, kind, id, active));
}
