import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { ActivityInput } from "@/lib/mapping/schema";
import { buildTemplateCsv } from "@/lib/mapping/files";
import { IMPORT_COLUMNS } from "@/lib/mapping/import";
import { recordEn, recordEt } from "@/lib/mapping/test-fixtures";

/* eslint-disable @typescript-eslint/no-explicit-any */
// In-memory stand-in for the Prisma client, covering what the mapping service touches. A transaction
// that throws is rolled back (the stores are restored), like the database does. Real constraints
// (CHECKs, FKs, unique indexes) are exercised on Railway.
type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  campaign: {} as Row,
  participant: {} as Row,
  acknowledged: true,
  categoryExists: true,
  knownSystems: ["sys1", "sys2"] as string[],
  activities: [] as Row[],
  batches: [] as Row[],
  audits: [] as Row[],
  nextId: 1,
}));

vi.mock("@/lib/db", () => {
  /** Normalizes the relation syntax Prisma receives into the stored shape. */
  const toVersion = (id: string, data: Row): Row => {
    const { primaryCategory, volumeUnit, systems, activity: _activity, ...rest } = data;
    void _activity;
    const row: Row = { id, ...rest };
    if (primaryCategory?.connect) row.primaryCategoryId = primaryCategory.connect.id;
    if (volumeUnit !== undefined) row.volumeUnitId = volumeUnit?.connect ? volumeUnit.connect.id : null;
    else if (!("volumeUnitId" in row)) row.volumeUnitId = null;
    if (systems) row.systems = (systems.connect ?? systems.set ?? []).map((s: Row) => ({ id: s.id }));
    if (!row.systems) row.systems = [];
    return row;
  };
  const latest = (a: Row) => [...a.versions].sort((x, y) => y.versionNumber - x.versionNumber).slice(0, 1);
  const withLatest = (a: Row) => ({ ...a, versions: latest(a).map((v) => ({ ...v, primaryCategory: { nameEn: "Cat" }, systems: v.systems })) });

  const tx = {
    analysisCampaign: { findUnique: async () => store.campaign },
    campaignParticipant: {
      // Only the participant record that belongs to the requested user is found.
      findUnique: async ({ where }: { where: Row }) =>
        store.participant.id && store.participant.userId === where.campaignId_userId?.userId ? { ...store.participant } : null,
      update: async ({ data }: { data: Row }) => Object.assign(store.participant, data),
    },
    campaignAcknowledgement: { findUnique: async () => (store.acknowledged ? { id: "ack" } : null) },
    activityCategory: {
      findFirst: async () => (store.categoryExists ? { id: "cat1" } : null),
      findMany: async () => [{ id: "cat1", nameEn: "Reconciliation & checks", nameEt: "Täpsustamine ja kontroll" }],
    },
    volumeUnit: {
      findFirst: async () => ({ id: "unit1" }),
      findMany: async () => [{ id: "unit1", key: "invoices", nameEn: "Invoices", nameEt: "Arved" }],
    },
    systemReference: {
      count: async ({ where }: { where: Row }) => (where.id.in as string[]).filter((id) => store.knownSystems.includes(id)).length,
      findMany: async () => [
        { id: "sys1", name: "ERP" },
        { id: "sys2", name: "Excel" },
      ],
    },
    initialActivity: {
      create: async ({ data }: { data: Row }) => {
        const activity: Row = {
          id: `a${store.nextId++}`,
          participantId: data.participantId,
          source: data.source,
          importBatchId: data.importBatchId ?? null,
          versions: [] as Row[],
        };
        activity.versions.push(toVersion(`v${store.nextId++}`, data.versions.create));
        store.activities.push(activity);
        return activity;
      },
      findFirst: async ({ where }: { where: Row }) => {
        const a = store.activities.find((x) => x.id === where.id && x.participantId === where.participantId);
        return a ? withLatest(a) : null;
      },
      findMany: async ({ where }: { where: Row }) => store.activities.filter((a) => a.participantId === where.participantId).map(withLatest),
      count: async () => store.activities.length,
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.activities.length;
        store.activities = store.activities.filter((x) => !(x.id === where.id && x.participantId === where.participantId));
        return { count: before - store.activities.length };
      },
    },
    initialActivityVersion: {
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const existing = store.activities.flatMap((a) => a.versions).find((x) => x.id === where.id)!;
        return Object.assign(existing, toVersion(existing.id, data), { id: existing.id });
      },
      create: async ({ data }: { data: Row }) => {
        const a = store.activities.find((x) => x.id === data.activity.connect.id)!;
        const v = toVersion(`v${store.nextId++}`, data);
        a.versions.push(v);
        return v;
      },
      updateMany: async ({ data }: { data: Row }) => {
        for (const v of store.activities.flatMap((a) => a.versions).filter((x) => x.versionNumber === 1)) Object.assign(v, data);
      },
    },
    initialMappingImportBatch: {
      findUnique: async ({ where }: { where: Row }) =>
        store.batches.find((b) => b.participantId === where.participantId_idempotencyKey.participantId && b.idempotencyKey === where.participantId_idempotencyKey.idempotencyKey) ?? null,
      findFirst: async ({ where }: { where: Row }) => store.batches.find((b) => b.participantId === where.participantId && b.contentHash === where.contentHash) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: `b${store.nextId++}`, importedAt: new Date(), status: "COMPLETED", ...data };
        store.batches.push(row);
        return row;
      },
    },
    auditLog: { create: async ({ data }: { data: Row }) => store.audits.push(data) },
  };
  const snapshot = () => structuredClone({ activities: store.activities, batches: store.batches, audits: store.audits, participant: store.participant });
  const db = {
    ...tx,
    $transaction: async (fn: (t: typeof tx) => unknown) => {
      const before = snapshot();
      try {
        return await fn(tx);
      } catch (e) {
        Object.assign(store, before);
        throw e;
      }
    },
  };
  return { db };
});

// syncCampaignStatus and INFO_TEXT_VERSION are not needed by the functions under test
vi.mock("@/lib/services/campaigns", () => ({ syncCampaignStatus: async (c: unknown) => c, INFO_TEXT_VERSION: "test" }));

import { completeMapping, deleteDraftActivity, getCompletionReview, importActivities, previewImport, saveActivity } from "./mapping";

const actor = (id: string, isOrgAdmin: boolean, departmentRole: Actor["departmentRole"], departmentId: string | null): Actor => ({
  id,
  organizationId: "org",
  isOrgAdmin,
  departmentRole,
  departmentId,
});
const employee = actor("emp", false, "EMPLOYEE", "acc");
const otherEmployee = actor("emp2", false, "EMPLOYEE", "acc");
const adminNoDepartment = actor("adm", true, null, null);
const adminManager = actor("am", true, "MANAGER", "acc");
const manager = actor("mgr", false, "MANAGER", "acc");

const input = (overrides: Partial<ActivityInput> = {}): ActivityInput => ({
  name: "Bank receipt review",
  description: "Review receipts",
  purpose: "Match payments",
  outputRecipient: "MANAGER",
  outputRecipientNote: null,
  primaryCategoryId: "cat1",
  tags: [],
  frequency: "DAILY",
  occurrenceCount: 1,
  avgDurationMinutes: 30,
  volume: null,
  volumeUnitId: null,
  systemIds: [],
  automationLevel: "MANUAL",
  ruleBasedDegree: "HIGH",
  judgementDegree: "LOW",
  exceptionFrequency: "RARE",
  dataManuallyCopied: false,
  needsInfoFromOthers: false,
  waiting: "NONE",
  rework: "NONE",
  seasonality: "EVEN",
  sensitiveData: ["NONE"],
  improvementOpportunity: false,
  employeeSuggestion: null,
  ...overrides,
});

const participating = (userId: string, extra: Row = {}) => {
  store.participant = { id: `p-${userId}`, campaignId: "c1", userId, status: "ACTIVE", mappingCompletedAt: null, ...extra };
};
const auditActions = () => store.audits.map((a) => a.action);

beforeEach(() => {
  // Only the clock is faked: the spreadsheet reader uses real streams and timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
  store.campaign = {
    id: "c1",
    organizationId: "org",
    departmentId: "acc",
    status: "ACTIVE",
    startDate: new Date("2026-11-09T00:00:00Z"),
    endDate: new Date("2026-11-27T00:00:00Z"),
  };
  participating("emp");
  store.acknowledged = true;
  store.categoryExists = true;
  store.knownSystems = ["sys1", "sys2"];
  store.activities = [];
  store.batches = [];
  store.audits = [];
  store.nextId = 1;
});
afterEach(() => vi.useRealTimers());

describe("saveActivity", () => {
  it("creates an activity with a first, not-yet-baseline version, recorded as directly entered", async () => {
    await saveActivity(employee, "c1", input());
    expect(store.activities).toHaveLength(1);
    expect(store.activities[0]).toMatchObject({ source: "DIRECT", importBatchId: null });
    expect(store.activities[0].versions).toHaveLength(1);
    expect(store.activities[0].versions[0]).toMatchObject({ versionNumber: 1, isBaseline: false, name: "Bank receipt review" });
  });

  it("edits the draft version in place before the mapping is completed", async () => {
    const activity = await saveActivity(employee, "c1", input());
    await saveActivity(employee, "c1", input({ avgDurationMinutes: 45 }), activity.id);
    expect(store.activities[0].versions).toHaveLength(1);
    expect(store.activities[0].versions[0].avgDurationMinutes).toBe(45);
  });

  it("adds a new version after completion and never overwrites the baseline", async () => {
    const activity = await saveActivity(employee, "c1", input());
    await completeMapping(employee, "c1");
    expect(store.activities[0].versions[0].isBaseline).toBe(true);

    await saveActivity(employee, "c1", input({ avgDurationMinutes: 60 }), activity.id);
    const versions = store.activities[0].versions;
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ versionNumber: 1, isBaseline: true, avgDurationMinutes: 30 });
    expect(versions[1]).toMatchObject({ versionNumber: 2, isBaseline: false, avgDurationMinutes: 60 });
  });

  it("requires acknowledging About This Analysis first", async () => {
    store.acknowledged = false;
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errAcknowledgeFirst" });
    expect(store.activities).toHaveLength(0);
  });

  it("is forbidden for a non-participant, and for a manager who is not a participant", async () => {
    // The participant row belongs to "emp", so the manager has no participation of their own.
    await expect(saveActivity(manager, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
    store.participant = {};
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("is forbidden for an Organization Admin who has no department", async () => {
    await expect(saveActivity(adminNoDepartment, "c1", input())).rejects.toMatchObject({ code: "errForbidden" });
  });

  it("does not let an Employee edit another Employee's activity", async () => {
    const activity = await saveActivity(employee, "c1", input());
    participating("emp2");
    await expect(saveActivity(otherEmployee, "c1", input({ name: "Hijack" }), activity.id)).rejects.toMatchObject({ code: "errNotFound" });
    expect(store.activities[0].versions[0].name).toBe("Bank receipt review");
  });

  it("is rejected once observation has ended", async () => {
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errCampaignClosed" });
  });

  it("rejects unknown references and invalid content", async () => {
    store.categoryExists = false;
    await expect(saveActivity(employee, "c1", input())).rejects.toMatchObject({ code: "errUnknownReference" });
    store.categoryExists = true;
    await expect(saveActivity(employee, "c1", input({ sensitiveData: ["NONE", "PERSONAL"] }))).rejects.toThrow();
    await expect(saveActivity(employee, "c1", input({ occurrenceCount: 0 }))).rejects.toThrow();
    await expect(saveActivity(employee, "c1", input({ avgDurationMinutes: 0 }))).rejects.toThrow();
    expect(store.activities).toHaveLength(0);
  });

  it("audits start, creation, material edits and deletion without copying any activity text", async () => {
    const a = await saveActivity(employee, "c1", input({ name: "Secret salary run", description: "Confidential details" }));
    await saveActivity(employee, "c1", input({ name: "Secret salary run", description: "Confidential details", avgDurationMinutes: 50 }), a.id);
    await deleteDraftActivity(employee, "c1", a.id);

    expect(auditActions()).toEqual(["mapping.started", "mapping.activityCreated", "mapping.activityUpdated", "mapping.activityDeleted"]);
    expect(store.audits[2].metadata).toMatchObject({ changed: ["avgDurationMinutes"], newVersion: false });
    expect(JSON.stringify(store.audits)).not.toContain("Secret salary run");
    expect(JSON.stringify(store.audits)).not.toContain("Confidential");
  });

  it("does not audit an edit that changed nothing", async () => {
    const a = await saveActivity(employee, "c1", input());
    store.audits = [];
    await saveActivity(employee, "c1", input(), a.id);
    expect(store.audits).toHaveLength(0);
  });
});

describe("completion", () => {
  it("needs at least one activity", async () => {
    await expect(completeMapping(employee, "c1")).rejects.toMatchObject({ code: "errNoActivities" });
  });

  it("marks the participant complete, makes version 1 the baseline and stores the baseline identity", async () => {
    await saveActivity(employee, "c1", input());
    await saveActivity(employee, "c1", input({ name: "Second" }));
    await completeMapping(employee, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
    expect(store.participant.mappingBaselineActivityCount).toBe(2);
    expect(store.participant.mappingBaselineHash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.activities.every((a) => a.versions[0].isBaseline)).toBe(true);
    const audit = store.audits.find((a) => a.action === "mapping.completed")!;
    expect(audit.metadata).toMatchObject({ activityCount: 2, baselineHash: store.participant.mappingBaselineHash });
    await expect(completeMapping(employee, "c1")).rejects.toMatchObject({ code: "errMappingCompleted" });
  });

  it("is blocked while an activity has an unresolved error, and changes nothing", async () => {
    await saveActivity(employee, "c1", input());
    store.categoryExists = false; // the category was deactivated meanwhile
    await expect(completeMapping(employee, "c1")).rejects.toMatchObject({ code: "errMappingHasErrors" });
    expect(store.participant.mappingCompletedAt).toBeNull();
    expect(store.activities[0].versions[0].isBaseline).toBe(false);
    const review = await getCompletionReview(employee, "c1");
    expect(review[0].errors).toEqual(["errCategoryInactive"]);
  });

  it("shows warnings for unusual values before completion but does not block", async () => {
    await saveActivity(employee, "c1", input({ avgDurationMinutes: 700 }));
    const review = await getCompletionReview(employee, "c1");
    expect(review[0]).toMatchObject({ errors: [], warnings: ["durationHigh"] });
    await expect(completeMapping(employee, "c1")).resolves.toBeUndefined();
  });

  it("deletes a draft activity but not after completion", async () => {
    const a = await saveActivity(employee, "c1", input());
    const b = await saveActivity(employee, "c1", input({ name: "Second" }));
    await deleteDraftActivity(employee, "c1", a.id);
    expect(store.activities).toHaveLength(1);

    await completeMapping(employee, "c1");
    await expect(deleteDraftActivity(employee, "c1", b.id)).rejects.toMatchObject({ code: "errMappingCompleted" });
    expect(store.activities).toHaveLength(1);
  });
});

describe("a Department Manager (or Organization Admin) who also participates", () => {
  it("maps their own work like any participant and completes their own baseline", async () => {
    participating("mgr");
    const activity = await saveActivity(manager, "c1", input({ name: "Month-end review" }));
    expect(store.activities[0].participantId).toBe("p-mgr");
    await completeMapping(manager, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
    expect(store.activities[0].versions[0]).toMatchObject({ isBaseline: true, name: "Month-end review" });

    await saveActivity(manager, "c1", input({ avgDurationMinutes: 50 }), activity.id);
    expect(store.activities[0].versions).toHaveLength(2);
  });

  it("works the same for an Organization Admin who is also the Department Manager", async () => {
    participating("am");
    await saveActivity(adminManager, "c1", input());
    await completeMapping(adminManager, "c1");
    expect(store.participant.mappingCompletedAt).toBeInstanceOf(Date);
  });

  it("never lets a manager change another participant's activities", async () => {
    participating("emp");
    const a = await saveActivity(employee, "c1", input());
    participating("mgr");
    await expect(saveActivity(manager, "c1", input({ name: "Hijack" }), a.id)).rejects.toMatchObject({ code: "errNotFound" });
    await expect(deleteDraftActivity(manager, "c1", a.id)).rejects.toMatchObject({ code: "errNotFound" });
  });
});

// ---------------------------------------------------------------------------------------------
// Template import
// ---------------------------------------------------------------------------------------------

const csvFile = (locale: "en" | "et", records: Record<string, string>[], name = "mapping.csv") => {
  const meta = buildTemplateCsv(locale).split("\n").slice(0, 2).join("\n");
  const lines = records.map((r) => IMPORT_COLUMNS.map((c) => `"${(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","));
  return { name, buffer: Buffer.from(`${meta}\n${lines.join("\n")}\n`, "utf-8") };
};
const meta = (over: Partial<{ rowCount: number; warningCount: number; errorCount: number; templateVersion: string }> = {}) => ({
  templateVersion: "1.0",
  templateLanguage: "en" as const,
  filename: "mapping.csv",
  rowCount: 1,
  warningCount: 0,
  errorCount: 0,
  ...over,
});
const payload = (rows: unknown[], key = "key-0001-abcdef", over: Row = {}) => ({ rows, idempotencyKey: key, acceptedWarnings: false, meta: meta({ rowCount: rows.length }), ...over });

describe("template import: preview before write", () => {
  it("previews a valid file without writing anything, and offers a key and a content hash", async () => {
    const preview = await previewImport(employee, "c1", csvFile("en", [recordEn()]), "en");
    expect(preview.summary).toEqual({ ready: 1, warning: 0, error: 0 });
    expect(preview.rows[0].input).not.toBeNull();
    expect(preview.templateVersion).toBe("1.0");
    expect(preview.templateLanguage).toBe("en");
    expect(preview.idempotencyKey.length).toBeGreaterThan(8);
    expect(preview.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Nothing was written: no activities, no batch, no audit entry. Cancelling afterwards changes nothing either.
    expect(store.activities).toHaveLength(0);
    expect(store.batches).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it("shows row-level errors and warnings and still writes nothing", async () => {
    await saveActivity(employee, "c1", input({ name: "Bank receipt review" }));
    store.audits = [];
    const preview = await previewImport(
      employee,
      "c1",
      csvFile("et", [recordEt(), { ...recordEt(), name: "Bank receipt review" }, { ...recordEt(), name: "Broken", frequency: "mõnikord" }]),
      "et",
    );
    expect(preview.summary).toEqual({ ready: 1, warning: 1, error: 1 });
    expect(preview.existingCount).toBe(1);
    expect(store.activities).toHaveLength(1);
    expect(store.batches).toHaveLength(0);
  });

  it("rejects a malformed file, an unsupported type and an oversized file", async () => {
    await expect(previewImport(employee, "c1", { name: "a.txt", buffer: Buffer.from("x") }, "en")).rejects.toMatchObject({ code: "errImportFileType" });
    await expect(previewImport(employee, "c1", { name: "a.csv", buffer: Buffer.alloc(1_000_001) }, "en")).rejects.toMatchObject({ code: "errImportFileTooLarge" });
    await expect(previewImport(employee, "c1", { name: "a.xlsx", buffer: Buffer.from("not a zip") }, "en")).rejects.toMatchObject({ code: "errImportContentMismatch" });
    await expect(previewImport(employee, "c1", { name: "a.csv", buffer: Buffer.from("name,purpose\nx,y") }, "en")).rejects.toMatchObject({ code: "errImportTemplateVersion" });
  });

  it("is only available to the participant's own mapping", async () => {
    // A manager who is not a participant, an admin with no department, and an acknowledgement-less participant.
    await expect(previewImport(manager, "c1", csvFile("en", [recordEn()]), "en")).rejects.toMatchObject({ code: "errForbidden" });
    await expect(previewImport(adminNoDepartment, "c1", csvFile("en", [recordEn()]), "en")).rejects.toMatchObject({ code: "errForbidden" });
    store.acknowledged = false;
    await expect(previewImport(employee, "c1", csvFile("en", [recordEn()]), "en")).rejects.toMatchObject({ code: "errAcknowledgeFirst" });
  });
});

describe("template import: confirmation", () => {
  const previewRows = async (records = [recordEn()], who: Actor = employee) =>
    (await previewImport(who, "c1", csvFile("en", records), "en")).rows.map((r) => r.input);

  it("writes canonical activities in one batch with source, template version and language", async () => {
    const rows = await previewRows();
    const result = await importActivities(employee, "c1", payload(rows));
    expect(result).toMatchObject({ created: 1, alreadyApplied: false });

    expect(store.activities).toHaveLength(1);
    expect(store.activities[0]).toMatchObject({ source: "IMPORT", participantId: "p-emp" });
    expect(store.activities[0].importBatchId).toBe(result.batchId);
    expect(store.activities[0].versions[0]).toMatchObject({ frequency: "MONTHLY", outputRecipient: "MANAGER", versionNumber: 1, isBaseline: false });
    expect(store.batches[0]).toMatchObject({
      participantId: "p-emp",
      campaignId: "c1",
      templateVersion: "1.0",
      templateLanguage: "en",
      sourceFilename: "mapping.csv",
      rowCount: 1,
      successCount: 1,
      warningCount: 0,
      errorCount: 0,
      status: "COMPLETED",
    });
  });

  it("audits the import with counts only, never the spreadsheet content", async () => {
    await importActivities(employee, "c1", payload(await previewRows()));
    const audit = store.audits.find((a) => a.action === "mapping.importConfirmed")!;
    expect(audit.metadata).toEqual({ created: 1, warnings: 0, rowsWithErrors: 0, templateVersion: "1.0", templateLanguage: "en" });
    expect(JSON.stringify(store.audits)).not.toContain("Month-end accrual check");
    expect(auditActions()).toContain("mapping.started");
  });

  it("makes imported activities editable like any other", async () => {
    await importActivities(employee, "c1", payload(await previewRows()));
    await saveActivity(employee, "c1", input({ name: "Edited after import", primaryCategoryId: "cat1" }), store.activities[0].id);
    expect(store.activities[0].versions[0].name).toBe("Edited after import");
    expect(store.activities[0].source).toBe("IMPORT");
  });

  it("is idempotent: confirming the same preview twice (double click, refresh, retry) imports once", async () => {
    const rows = await previewRows();
    const first = await importActivities(employee, "c1", payload(rows, "key-same-0001"));
    const again = await importActivities(employee, "c1", payload(rows, "key-same-0001"));
    expect(again).toMatchObject({ alreadyApplied: true, created: 1, batchId: first.batchId });
    expect(store.activities).toHaveLength(1);
    expect(store.batches).toHaveLength(1);
  });

  it("detects the same content uploaded again, in the preview and at confirmation", async () => {
    const rows = await previewRows();
    await importActivities(employee, "c1", payload(rows, "key-first-0001"));

    const second = await previewImport(employee, "c1", csvFile("en", [recordEn()]), "en");
    expect(second.alreadyImportedAt).not.toBeNull();
    await expect(importActivities(employee, "c1", payload(rows, "key-second-0002"))).rejects.toMatchObject({ code: "errImportAlreadyImported" });
    expect(store.activities).toHaveLength(1);
  });

  it("requires the participant to accept warnings, recomputed on the server", async () => {
    await saveActivity(employee, "c1", input({ name: "Bank receipt review", description: "Review receipts" }));
    const rows = await previewRows([{ ...recordEn(), name: "Bank receipt review" }]);
    await expect(importActivities(employee, "c1", payload(rows, "key-warn-0001"))).rejects.toMatchObject({ code: "errImportWarningsNotAccepted" });
    expect(store.activities).toHaveLength(1);

    // A client that claims "no warnings" cannot skip the review.
    await expect(importActivities(employee, "c1", payload(rows, "key-warn-0002", { meta: meta({ warningCount: 0 }) }))).rejects.toMatchObject({ code: "errImportWarningsNotAccepted" });

    await importActivities(employee, "c1", payload(rows, "key-warn-0003", { acceptedWarnings: true, meta: meta({ warningCount: 1 }) }));
    expect(store.activities).toHaveLength(2); // a duplicate is never merged: it is a new, separate activity
  });

  it("revalidates every row on the server and rejects an unsupported template version", async () => {
    await expect(importActivities(employee, "c1", payload([{ ...input(), occurrenceCount: 0 }], "key-bad-0001"))).rejects.toThrow();
    await expect(importActivities(employee, "c1", payload([{ ...input(), sensitiveData: ["NONE", "PERSONAL"] }], "key-bad-0002"))).rejects.toThrow();
    await expect(importActivities(employee, "c1", payload([input()], "key-bad-0003", { meta: meta({ templateVersion: "9.9" }) }))).rejects.toMatchObject({ code: "errImportTemplateVersion" });
    await expect(importActivities(employee, "c1", payload(Array.from({ length: 201 }, () => input()), "key-bad-0004"))).rejects.toThrow();
    await expect(importActivities(employee, "c1", { rows: [input()], idempotencyKey: "short", acceptedWarnings: false, meta: meta() })).rejects.toThrow();
    expect(store.activities).toHaveLength(0);
  });

  it("writes nothing when any row fails, leaves the existing mapping untouched and records only the failed attempt", async () => {
    await saveActivity(employee, "c1", input({ name: "Existing activity", description: "Existing description" }));
    store.audits = [];
    const rows = [
      input({ name: "Imported one", description: "First description", systemIds: ["sys1"] }),
      input({ name: "Imported two", description: "Second description", systemIds: ["sys-unknown"] }),
    ];
    await expect(importActivities(employee, "c1", payload(rows, "key-fail-0001"))).rejects.toMatchObject({ code: "errUnknownReference" });

    expect(store.activities).toHaveLength(1);
    expect(store.activities[0].versions[0].name).toBe("Existing activity");
    expect(store.batches).toHaveLength(0);
    expect(auditActions()).toEqual(["mapping.importFailed"]);
    expect(store.audits[0].metadata).toEqual({ reason: "errUnknownReference" });
  });

  it("is refused for anyone but the participant: a manager cannot import for another participant", async () => {
    const rows = await previewRows();
    await expect(importActivities(manager, "c1", payload(rows, "key-mgr-0001"))).rejects.toMatchObject({ code: "errForbidden" });
    await expect(importActivities(adminNoDepartment, "c1", payload(rows, "key-adm-0001"))).rejects.toMatchObject({ code: "errForbidden" });
    expect(store.activities).toHaveLength(0);
    expect(store.batches).toHaveLength(0);
  });

  it("lets a Department Manager who participates import into their own mapping only", async () => {
    participating("mgr");
    const rows = await previewRows([recordEn()], manager);
    await importActivities(manager, "c1", payload(rows, "key-mgr-0002"));
    expect(store.activities[0].participantId).toBe("p-mgr");
    expect(store.batches[0].participantId).toBe("p-mgr");
  });

  it("is refused once the campaign no longer collects data", async () => {
    const rows = await previewRows();
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    await expect(importActivities(employee, "c1", payload(rows, "key-late-0001"))).rejects.toMatchObject({ code: "errCampaignClosed" });
  });
});
