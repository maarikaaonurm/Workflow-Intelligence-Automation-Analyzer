import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { buildTemplateCsv, buildTemplateXlsx, templateFilename } from "@/lib/mapping/files";
import { localizeCategory, localized } from "@/lib/mapping/present";
import { listReferenceData } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

/**
 * The standard Initial Activity Mapping template (Excel or CSV) for the signed-in participant,
 * in the current interface language: Estonian UI gives the Estonian template, English UI the English one.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.actor.departmentRole === null) return new Response("Forbidden", { status: 403 });
  const { locale } = await getT();

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(buildTemplateCsv(locale), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${templateFilename(locale, "csv")}"`,
      },
    });
  }

  const { categories, units, systems } = await listReferenceData(user.actor, { participantView: true });
  const buffer = await buildTemplateXlsx(locale, {
    categories: categories.map((c) => localizeCategory(c, locale)),
    units: units.map((u) => localized(u, locale)),
    systems: systems.map((s) => s.name),
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${templateFilename(locale, "xlsx")}"`,
    },
  });
}
