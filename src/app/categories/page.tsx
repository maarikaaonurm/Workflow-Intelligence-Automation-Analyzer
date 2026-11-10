import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listReferenceData } from "@/lib/services/reference";
import { localizeCategory } from "@/lib/mapping/present";

export const dynamic = "force-dynamic";

/** Activity Category Guide: the same definitions are used for help and, later, AI classification. */
export default async function CategoryGuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t, locale } = await getT();
  const { categories } = await listReferenceData(user.actor);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("categoryGuide")}</h1>
      <p className="text-gray-600">{t("categoryGuideIntro")}</p>
      {categories.length === 0 && <p className="text-gray-600">{t("noCategories")}</p>}
      <ul className="space-y-4">
        {categories.map((c) => {
          const lc = localizeCategory(c, locale);
          return (
            <li key={c.id} className="rounded border border-gray-200 p-4">
              <h2 className="text-lg font-medium">
                {lc.name}
                {c.departmentId && <span className="ml-2 rounded bg-surface px-2 py-0.5 text-xs text-gray-600">{t("departmentSpecific")}</span>}
              </h2>
              <p className="mt-1 text-sm">{lc.definition}</p>
              <p className="mt-2 text-sm"><span className="font-medium">{t("belongsHere")}:</span> {lc.belongsHere}</p>
              <p className="text-sm"><span className="font-medium">{t("notBelongsHere")}:</span> {lc.notBelongsHere}</p>
              {lc.boundaryExamples && (
                <p className="text-sm"><span className="font-medium">{t("boundaryExamples")}:</span> {lc.boundaryExamples}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
