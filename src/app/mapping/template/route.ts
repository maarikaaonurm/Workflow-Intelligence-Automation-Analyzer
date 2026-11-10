import { getCurrentUser } from "@/lib/auth/session";
import { buildTemplateCsv, buildTemplateXlsx } from "@/lib/mapping/files";
import { listReferenceData } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

/** The standard Initial Activity Mapping template (Excel or CSV) for the signed-in Employee. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.actor.departmentRole === null) return new Response("Forbidden", { status: 403 });

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(buildTemplateCsv(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="initial-activity-mapping-template.csv"',
      },
    });
  }

  const { categories, units, systems } = await listReferenceData(user.actor, { participantView: true });
  const buffer = await buildTemplateXlsx({
    categories: categories.map((c) => c.nameEn),
    units: units.map((u) => u.nameEn),
    systems: systems.map((s) => s.name),
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="initial-activity-mapping-template.xlsx"',
    },
  });
}
