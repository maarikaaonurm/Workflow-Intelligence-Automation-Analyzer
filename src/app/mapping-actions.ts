"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { AppError } from "@/lib/errors";
import { parseActivityForm } from "@/lib/mapping/form";
import {
  completeMapping,
  deleteDraftActivity,
  importActivities,
  previewImport,
  saveActivity,
  type ImportPreview,
} from "@/lib/services/mapping";
import { ensureMappingDemoData } from "@/lib/demo/mapping-demo";
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
  preview?: ImportPreview;
  campaignId?: string;
}

/** Parses the uploaded template and returns a preview. Nothing is written to the database. */
export async function previewImportAction(_prev: ImportPreviewState, formData: FormData): Promise<ImportPreviewState> {
  const { actor } = await requireUser();
  const { locale } = await getT();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "errImportNoFile" };
  try {
    const preview = await previewImport(actor, campaignId, { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, locale);
    return { preview, campaignId };
  } catch (e) {
    if (e instanceof AppError) return { error: e.code };
    throw e;
  }
}

/** Writes the confirmed rows. The preview step has already shown everything that will be saved. */
export async function confirmImportAction(formData: FormData) {
  const { actor } = await requireUser();
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    redirect("/mapping/import?error=errInvalidInput");
  }
  let result;
  try {
    result = await importActivities(actor, campaignId, {
      ...(payload as object),
      acceptedWarnings: formData.get("acceptedWarnings") === "yes",
    });
  } catch (e) {
    if (e instanceof AppError || e instanceof z.ZodError) {
      redirect(`/mapping/import?error=${e instanceof AppError ? e.code : "errInvalidInput"}`);
    }
    throw e;
  }
  redirect(`/mapping/import/result?batch=${encodeURIComponent(result.batchId)}&again=${result.alreadyApplied ? "1" : "0"}`);
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
        definitionEt: optional(formData, "definitionEt"),
        belongsHereEt: optional(formData, "belongsHereEt"),
        notBelongsHereEt: optional(formData, "notBelongsHereEt"),
        boundaryExamplesEt: optional(formData, "boundaryExamplesEt"),
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

/** Loads the idempotent synthetic demo department, campaign and example mappings. */
export async function loadDemoDataAction() {
  const { actor } = await requireUser();
  await adminAttempt(() => ensureMappingDemoData(actor).then(() => undefined));
}
