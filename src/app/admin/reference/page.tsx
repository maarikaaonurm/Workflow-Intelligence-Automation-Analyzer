import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { can } from "@/lib/auth/policy";
import { listReferenceData } from "@/lib/services/reference";
import { listDepartments } from "@/lib/services/departments";
import { localized } from "@/lib/mapping/present";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  createCategoryAction,
  createSystemAction,
  createUnitAction,
  loadStandardDataAction,
  loadDemoDataAction,
  setReferenceActiveAction,
} from "../../mapping-actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
const primary = "rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark";
const secondary = "rounded border border-primary px-2 py-0.5 text-xs text-primary";

export default async function ReferencePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { actor } = user;
  if (!can(actor, "reference:manage", { organizationId: actor.organizationId })) redirect("/");
  const { t, locale } = await getT();
  const { error } = await searchParams;

  const [{ categories, units, systems }, departments] = await Promise.all([
    listReferenceData(actor, { includeInactive: true }),
    listDepartments(actor),
  ]);

  const toggle = (kind: string, id: string, active: boolean) => (
    <form action={setReferenceActiveAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button className={secondary}>{active ? t("deactivate") : t("activate")}</button>
    </form>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("referenceData")}</h1>
        <form action={loadStandardDataAction}>
          <button className={primary}>{t("loadStandardData")}</button>
        </form>
      </div>
      <p className="text-sm text-gray-600">{t("loadStandardHelp")}</p>
      <form action={loadDemoDataAction} className="space-y-1">
        <button className={primary}>{t("loadDemoData")}</button>
        <p className="text-sm text-gray-600">{t("demoHelp")}</p>
      </form>
      <ErrorBanner code={error} t={t} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("activityCategories")}</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className={c.active ? "" : "text-gray-400"}>
                {localized(c, locale)}
                <span className="ml-2 text-xs text-gray-500">
                  {c.departmentId ? departments.find((d) => d.id === c.departmentId)?.name : t("standard")}
                </span>
              </span>
              {toggle("category", c.id, c.active)}
            </li>
          ))}
        </ul>
        <form action={createCategoryAction} className="grid grid-cols-2 gap-3 rounded border border-gray-200 p-4 text-sm">
          <h3 className="col-span-2 font-medium">{t("addCategory")}</h3>
          <label className="flex flex-col">{t("nameEn")}<input name="nameEn" required maxLength={100} className={input} /></label>
          <label className="flex flex-col">{t("nameEt")}<input name="nameEt" required maxLength={100} className={input} /></label>
          <label className="col-span-2 flex flex-col">{t("department")}
            <select name="departmentId" className={input}>
              <option value="">{t("standard")}</option>
              {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col">{t("definition")}<textarea name="definition" required rows={2} maxLength={500} className={input} /></label>
          <label className="flex flex-col">{t("belongsHere")}<textarea name="belongsHere" required rows={2} maxLength={500} className={input} /></label>
          <label className="flex flex-col">{t("notBelongsHere")}<textarea name="notBelongsHere" required rows={2} maxLength={500} className={input} /></label>
          <label className="col-span-2 flex flex-col">{t("boundaryExamples")}<textarea name="boundaryExamples" rows={2} maxLength={500} className={input} /></label>
          <p className="col-span-2 text-xs text-gray-500">{t("fallbackNote")}</p>
          <label className="col-span-2 flex flex-col">{t("definitionEt")}<textarea name="definitionEt" rows={2} maxLength={500} className={input} /></label>
          <label className="flex flex-col">{t("belongsHereEt")}<textarea name="belongsHereEt" rows={2} maxLength={500} className={input} /></label>
          <label className="flex flex-col">{t("notBelongsHereEt")}<textarea name="notBelongsHereEt" rows={2} maxLength={500} className={input} /></label>
          <label className="col-span-2 flex flex-col">{t("boundaryExamplesEt")}<textarea name="boundaryExamplesEt" rows={2} maxLength={500} className={input} /></label>
          <div><button className={primary}>{t("create")}</button></div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("volumeUnits")}</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className={u.active ? "" : "text-gray-400"}>
                {u.nameEn} / {u.nameEt} <span className="text-xs text-gray-500">({u.key})</span>
              </span>
              {toggle("unit", u.id, u.active)}
            </li>
          ))}
        </ul>
        <form action={createUnitAction} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col">{t("unitKey")}<input name="key" required pattern="[a-z][a-z0-9_]{1,39}" className={input} /></label>
          <label className="flex flex-col">{t("nameEn")}<input name="nameEn" required maxLength={60} className={input} /></label>
          <label className="flex flex-col">{t("nameEt")}<input name="nameEt" required maxLength={60} className={input} /></label>
          <button className={primary}>{t("create")}</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t("systemsTitle")}</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {systems.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className={s.active ? "" : "text-gray-400"}>{s.name}</span>
              {toggle("system", s.id, s.active)}
            </li>
          ))}
        </ul>
        <form action={createSystemAction} className="flex items-end gap-3 text-sm">
          <label className="flex flex-col">{t("systemName")}<input name="name" required maxLength={80} className={input} /></label>
          <button className={primary}>{t("create")}</button>
        </form>
      </section>
    </div>
  );
}
