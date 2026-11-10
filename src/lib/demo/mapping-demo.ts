import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/policy";
import { ForbiddenError } from "@/lib/errors";
import { fromISODate, todayISO } from "@/lib/campaigns/dates";
import { ensureStandardReferenceData } from "@/lib/reference/standard";
import { baselineHash, contentHash } from "@/lib/mapping/baseline";
import type { ActivityInput } from "@/lib/mapping/schema";
import { INFO_TEXT_VERSION } from "@/lib/services/campaigns";
import { versionFields } from "@/lib/services/mapping";

// Entirely synthetic: fictional people, a fictional department and made-up activities.
const DEPARTMENT = "Mapping Demo";
const CAMPAIGN = "Mapping demo (synthetic)";

const email = (name: string) =>
  `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, ".")}@demo.example`;

interface DemoActivity extends Partial<ActivityInput> {
  name: string;
  category: string;
  unit?: string;
  systems?: string[];
}

export interface DemoResult {
  /** False when the demo campaign already existed (or the department already has a campaign): nothing changed. */
  created: boolean;
}

/**
 * Loads an idempotent synthetic demo: one department with a campaign and four participants whose
 * mappings are Completed (with a directly entered and an imported activity), Draft, Not started,
 * and a Department Manager who is also an Organization Admin and a participant with their own
 * completed mapping. Only runs when the demo department has no campaign yet, so it never
 * collides with a campaign someone created by hand. Organization Admin only.
 */
export async function ensureMappingDemoData(actor: Actor): Promise<DemoResult> {
  if (!can(actor, "reference:manage", { organizationId: actor.organizationId })) throw new ForbiddenError();
  const organizationId = actor.organizationId;

  return db.$transaction(
    async (tx) => {
      await ensureStandardReferenceData(tx, organizationId);

      const department =
        (await tx.department.findFirst({ where: { organizationId, name: DEPARTMENT } })) ??
        (await tx.department.create({ data: { organizationId, name: DEPARTMENT } }));

      const person = async (name: string, isOrgAdmin: boolean) => {
        const [firstName, ...rest] = name.split(" ");
        const user = await tx.user.upsert({
          where: { email: email(name) },
          update: {},
          create: { organizationId, email: email(name), firstName, lastName: rest.join(" "), name, isOrgAdmin },
        });
        return user;
      };
      const mati = await person("Mati Karu", true); // Organization Admin + Department Manager
      const eha = await person("Eha Lill", false);
      const juri = await person("Jüri Tamm", false);
      const tiiu = await person("Tiiu Rand", false);

      const addMember = async (userId: string, role: "MANAGER" | "EMPLOYEE") => {
        if (await tx.departmentMembership.findFirst({ where: { userId, active: true } })) return;
        if (role === "MANAGER" && (await tx.departmentMembership.findFirst({ where: { departmentId: department.id, active: true, role: "MANAGER" } }))) return;
        await tx.departmentMembership.create({ data: { userId, departmentId: department.id, role } });
      };
      await addMember(mati.id, "MANAGER");
      await addMember(eha.id, "EMPLOYEE");
      await addMember(juri.id, "EMPLOYEE");
      await addMember(tiiu.id, "EMPLOYEE");

      // Never add a second campaign next to one that already exists in this department.
      if (await tx.analysisCampaign.findFirst({ where: { departmentId: department.id } })) return { created: false };

      const startISO = todayISO();
      const start = fromISODate(startISO);
      const end = new Date(start.getTime() + 20 * 24 * 60 * 60 * 1000);
      const campaign = await tx.analysisCampaign.create({
        data: {
          organizationId,
          departmentId: department.id,
          name: CAMPAIGN,
          startDate: start,
          endDate: end,
          status: "ACTIVE",
          createdById: mati.id,
          launchedAt: new Date(),
          retentionSnapshot: { diaryRetentionMonths: 12, postRetentionAction: "DELETE", source: "defaults-v0" },
        },
      });

      const participants: Record<string, string> = {};
      for (const user of [mati, eha, juri, tiiu]) {
        const participant = await tx.campaignParticipant.create({
          data: {
            campaignId: campaign.id,
            userId: user.id,
            joinedAt: start,
            periods: { create: { startDate: start, startedKind: "INITIAL", startedById: mati.id } },
          },
        });
        participants[user.id] = participant.id;
        await tx.campaignAcknowledgement.create({ data: { campaignId: campaign.id, userId: user.id, textVersion: INFO_TEXT_VERSION } });
      }

      const categories = new Map((await tx.activityCategory.findMany({ where: { organizationId, departmentId: null } })).map((c) => [c.nameEn, c.id]));
      const units = new Map((await tx.volumeUnit.findMany({ where: { organizationId } })).map((u) => [u.key, u.id]));
      const systems = new Map((await tx.systemReference.findMany({ where: { organizationId } })).map((s) => [s.name, s.id]));

      const toInput = (a: DemoActivity): ActivityInput => ({
        description: `${a.name} (synthetic example)`,
        purpose: "Synthetic example output",
        outputRecipient: "MANAGER",
        outputRecipientNote: null,
        tags: [],
        frequency: "MONTHLY",
        occurrenceCount: 1,
        avgDurationMinutes: 60,
        volume: null,
        automationLevel: "MANUAL",
        ruleBasedDegree: "MEDIUM",
        judgementDegree: "MEDIUM",
        exceptionFrequency: "OCCASIONAL",
        dataManuallyCopied: false,
        needsInfoFromOthers: false,
        waiting: "NONE",
        rework: "NONE",
        seasonality: "EVEN",
        sensitiveData: ["NONE"],
        improvementOpportunity: false,
        employeeSuggestion: null,
        ...a,
        primaryCategoryId: categories.get(a.category) ?? "",
        volumeUnitId: a.unit ? (units.get(a.unit) ?? null) : null,
        systemIds: (a.systems ?? []).map((s) => systems.get(s)).filter((id): id is string => Boolean(id)),
      });

      const create = async (userId: string, a: DemoActivity, baseline: boolean, origin: { source: "DIRECT" | "IMPORT"; batchId?: string } = { source: "DIRECT" }) => {
        const input = toInput(a);
        const { category: _c, unit: _u, ...clean } = input as ActivityInput & { category?: string; unit?: string };
        void _c;
        void _u;
        const activity = await tx.initialActivity.create({
          data: {
            campaignId: campaign.id,
            participantId: participants[userId],
            source: origin.source,
            importBatchId: origin.batchId ?? null,
            versions: { create: { versionNumber: 1, isBaseline: baseline, createdById: userId, ...versionFields(clean as ActivityInput) } },
          },
        });
        return { activityId: activity.id, content: clean as ActivityInput };
      };
      const complete = async (userId: string, items: { activityId: string; content: ActivityInput }[]) => {
        await tx.campaignParticipant.update({
          where: { id: participants[userId] },
          data: { mappingCompletedAt: new Date(), mappingBaselineHash: baselineHash(items), mappingBaselineActivityCount: items.length },
        });
      };

      // Eha: completed mapping with variety (directly entered activities and one imported)
      const ehaItems = [
        await create(eha.id, {
          name: "Bank receipt review", category: "Reconciliation & checks", frequency: "DAILY", avgDurationMinutes: 30, systems: ["Bank portal", "ERP system"],
          volume: 40, unit: "transactions", ruleBasedDegree: "HIGH", judgementDegree: "LOW", exceptionFrequency: "RARE", dataManuallyCopied: true,
          rework: "SOMETIMES", sensitiveData: ["FINANCIAL"], improvementOpportunity: true, employeeSuggestion: "Import the bank file automatically (synthetic suggestion).",
        }, true),
        await create(eha.id, {
          name: "Month-end accrual check", category: "Reconciliation & checks", avgDurationMinutes: 90, seasonality: "END_OF_MONTH", automationLevel: "PARTIAL",
          systems: ["ERP system", "Excel"], waiting: "SOMETIMES", sensitiveData: ["FINANCIAL"],
        }, true),
        await create(eha.id, {
          name: "Customer balance query handling", category: "Customer & stakeholder handling", frequency: "WEEKLY", occurrenceCount: 5, avgDurationMinutes: 15,
          outputRecipient: "CUSTOMER", volume: 12, unit: "requests", exceptionFrequency: "FREQUENT", needsInfoFromOthers: true, sensitiveData: ["PERSONAL", "FINANCIAL"],
        }, true),
        await create(eha.id, {
          name: "Supplier master data corrections", category: "Master data & system maintenance", frequency: "AD_HOC", occurrenceCount: 6, avgDurationMinutes: 20,
          outputRecipient: "SYSTEM", seasonality: "OTHER", rework: "OFTEN", sensitiveData: ["CONFIDENTIAL"], systems: ["ERP system"],
        }, true),
      ];
      const imported = toInput({
        name: "Quarterly VAT return preparation", category: "Reporting & analysis", frequency: "QUARTERLY", avgDurationMinutes: 240, seasonality: "QUARTER_END",
        outputRecipient: "AUTHORITY", systems: ["Excel", "Reporting tool"],
      });
      const batch = await tx.initialMappingImportBatch.create({
        data: {
          campaignId: campaign.id,
          participantId: participants[eha.id],
          idempotencyKey: "demo-import-eha-0001",
          contentHash: contentHash([imported]),
          templateVersion: "1.0",
          templateLanguage: "en",
          sourceFilename: "demo_mapping.xlsx",
          rowCount: 1,
          successCount: 1,
          warningCount: 0,
          errorCount: 0,
        },
      });
      ehaItems.push(
        await create(eha.id, {
          name: "Quarterly VAT return preparation", category: "Reporting & analysis", frequency: "QUARTERLY", avgDurationMinutes: 240, seasonality: "QUARTER_END",
          outputRecipient: "AUTHORITY", systems: ["Excel", "Reporting tool"],
        }, true, { source: "IMPORT", batchId: batch.id }),
      );
      await complete(eha.id, ehaItems);

      // Jüri: a draft (not completed)
      await create(juri.id, { name: "Invoice validation", category: "Approvals & controls", frequency: "DAILY", occurrenceCount: 3, avgDurationMinutes: 20, systems: ["ERP system"], judgementDegree: "HIGH" }, false);
      await create(juri.id, { name: "Weekly reporting pack", category: "Reporting & analysis", frequency: "WEEKLY", avgDurationMinutes: 120, systems: ["Excel"], automationLevel: "PARTIAL" }, false);

      // Tiiu: not started (no activities)

      // Mati: Organization Admin + Department Manager + participant, with their own completed mapping
      await complete(mati.id, [
        await create(mati.id, { name: "Approve payment batches", category: "Approvals & controls", frequency: "WEEKLY", occurrenceCount: 2, avgDurationMinutes: 45, judgementDegree: "HIGH", systems: ["Bank portal"], sensitiveData: ["FINANCIAL"] }, true),
        await create(mati.id, { name: "Prepare management report", category: "Reporting & analysis", avgDurationMinutes: 180, seasonality: "END_OF_MONTH", systems: ["Reporting tool", "Excel"] }, true),
      ]);

      await writeAudit(tx, {
        organizationId,
        departmentId: department.id,
        campaignId: campaign.id,
        actorId: actor.id,
        action: "demo.mappingDataLoaded",
        targetType: "AnalysisCampaign",
        targetId: campaign.id,
      });
      return { created: true };
    },
    { timeout: 30000 },
  );
}
