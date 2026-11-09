"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmImportAction, previewImportAction, type ImportPreviewState } from "@/app/mapping-actions";

export function ImportForm({ campaignId, labels }: { campaignId: string; labels: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<ImportPreviewState, FormData>(previewImportAction, {});
  const t = (key: string) => labels[key] ?? key;
  const rows = state.rows ?? [];
  const valid = rows.filter((r) => r.input !== null);
  const issueText = (i: { field: string; code: string; value?: string }) =>
    `${i.field}: ${t(`imp_${i.code}`)}${i.value ? ` (${i.value})` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        {/* Plain links on purpose: these are file downloads from a route handler, not pages. */}
        <a href="/mapping/template?format=xlsx" download className="text-primary underline">{t("downloadXlsx")}</a>
        <a href="/mapping/template?format=csv" download className="text-primary underline">{t("downloadCsv")}</a>
      </div>

      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        <button disabled={pending} className="rounded border border-primary px-3 py-1 text-sm text-primary disabled:opacity-60">
          {t("previewImport")}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t(state.error)}</p>
      )}

      {state.rows && (
        <div className="space-y-3">
          <p className="text-sm">
            {valid.length} / {rows.length} {t("importRowsValid")}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">{t("importNoRows")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-1 pr-3">{t("importRow")}</th>
                  <th className="py-1 pr-3">{t("field_name")}</th>
                  <th className="py-1">{t("importResult")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNumber} className="border-b border-gray-100 align-top">
                    <td className="py-1 pr-3">{r.rowNumber}</td>
                    <td className="py-1 pr-3">{r.input?.name ?? ""}</td>
                    <td className="py-1">
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="text-primary">{t("importOk")}</span>}
                      {r.errors.map((e, i) => (
                        <p key={`e${i}`} className="text-red-700">{issueText(e)}</p>
                      ))}
                      {r.warnings.map((w, i) => (
                        <p key={`w${i}`} className="text-amber-700">{issueText(w)}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {valid.length > 0 && (
            <form action={confirmImportAction} className="flex items-center gap-3">
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="rows" value={JSON.stringify(valid.map((r) => r.input))} />
              <button className="rounded bg-primary px-4 py-2 text-white hover:bg-primary-dark">
                {t("confirmImport")} ({valid.length})
              </button>
              {valid.length < rows.length && <span className="text-sm text-gray-600">{t("importSkipNote")}</span>}
            </form>
          )}
        </div>
      )}
      <Link href="/mapping" className="text-sm text-primary underline">{t("back")}</Link>
    </div>
  );
}
