"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { confirmImportAction, previewImportAction, type ImportPreviewState } from "@/app/mapping-actions";
import type { ImportIssue, RowStatus } from "@/lib/mapping/import";

const STATUS_STYLE: Record<RowStatus, string> = {
  READY: "text-primary",
  WARNING: "text-amber-700",
  ERROR: "text-red-700",
};

/**
 * Staged import: upload -> preview -> confirm. Nothing is written until the final
 * "Confirm import"; cancelling or leaving at any earlier stage saves nothing.
 */
export function ImportForm({ campaignId, labels }: { campaignId: string; labels: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<ImportPreviewState, FormData>(previewImportAction, {});
  const [stage, setStage] = useState<"preview" | "confirm">("preview");
  const [acceptedWarnings, setAcceptedWarnings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const t = (key: string) => labels[key] ?? key;
  const fill = (template: string, vars: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

  const preview = state.preview;
  const rows = preview?.rows ?? [];
  const importable = rows.filter((r) => r.input !== null);
  const warningRows = rows.filter((r) => r.status === "WARNING");
  const errorRows = rows.filter((r) => r.status === "ERROR");
  const duplicateWarnings = rows.reduce((n, r) => n + r.warnings.filter((w) => w.code.startsWith("duplicate")).length, 0);
  const blockedAsDuplicate = preview?.alreadyImportedAt != null;

  const issueText = (i: ImportIssue) => `${t(`col_${i.field}`)}: ${t(`imp_${i.code}`)}${i.value ? ` (“${i.value}”)` : ""}`;
  const importDate = preview?.alreadyImportedAt ? preview.alreadyImportedAt.slice(0, 10) : "";

  // The payload is only what the server needs; it validates everything again on its side.
  const payload = preview
    ? JSON.stringify({
        rows: importable.map((r) => r.input),
        idempotencyKey: preview.idempotencyKey,
        meta: {
          templateVersion: preview.templateVersion,
          templateLanguage: preview.templateLanguage,
          filename: preview.filename,
          rowCount: rows.length,
          warningCount: warningRows.length,
          errorCount: errorRows.length,
        },
      })
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        {/* Plain links on purpose: these are file downloads from a route handler, not pages. */}
        <a href="/mapping/template?format=xlsx" download className="text-primary underline">{t("downloadTemplate")} (.xlsx)</a>
        <a href="/mapping/template?format=csv" download className="text-primary underline">{t("downloadTemplate")} (.csv)</a>
      </div>
      <p className="text-xs text-gray-500">{t("supportedFiles")}</p>

      <form
        action={(data) => {
          setStage("preview");
          setAcceptedWarnings(false);
          return formAction(data);
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        <button disabled={pending} className="rounded border border-primary px-3 py-1 text-sm text-primary disabled:opacity-60">
          {t("previewImport")}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(state.error)}
          {state.error === "errImportTemplateVersion" && (
            <>
              {" "}
              <a href="/mapping/template?format=xlsx" download className="underline">{t("downloadTemplate")}</a>
            </>
          )}
        </p>
      )}

      {preview && stage === "preview" && (
        <section className="space-y-3">
          <h2 className="font-medium">{t("importPreviewTitle")}</h2>
          <p className="text-sm" aria-live="polite">
            {preview.summary.ready} {t("importSummaryReady")} · {preview.summary.warning} {t("importSummaryWarning")} · {preview.summary.error} {t("importSummaryError")}
          </p>
          <p className="text-xs text-gray-500">{t("importNothingSaved")}</p>
          {blockedAsDuplicate && (
            <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              {fill(t("importAlreadyImported"), { date: importDate })}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">{t("importNoRows")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-1 pr-2">{t("importRowN")}</th>
                    <th className="py-1 pr-2">{t("colStatus")}</th>
                    <th className="py-1 pr-2">{t("colActivity")}</th>
                    <th className="py-1 pr-2">{t("colCategory")}</th>
                    <th className="py-1 pr-2">{t("colFrequency")}</th>
                    <th className="py-1 pr-2">{t("colOccurrences")}</th>
                    <th className="py-1 pr-2">{t("colDuration")}</th>
                    <th className="py-1 pr-2">{t("colVolume")}</th>
                    <th className="py-1 pr-2">{t("colSystems")}</th>
                    <th className="py-1">{t("colMessages")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className="border-b border-gray-100 align-top">
                      <td className="py-1 pr-2">{r.rowNumber}</td>
                      <td className={`py-1 pr-2 font-medium ${STATUS_STYLE[r.status]}`}>{t(`row${r.status}`)}</td>
                      <td className="py-1 pr-2">{r.preview.name}</td>
                      <td className="py-1 pr-2">{r.preview.category}</td>
                      <td className="py-1 pr-2">{r.preview.frequency ? t(`freq${r.preview.frequency}`) : ""}</td>
                      <td className="py-1 pr-2">{r.preview.occurrenceCount}</td>
                      <td className="py-1 pr-2">{r.preview.avgDurationMinutes ? `${r.preview.avgDurationMinutes} ${t("minutesShort")}` : ""}</td>
                      <td className="py-1 pr-2">{r.preview.volume ? `${r.preview.volume} ${r.preview.unit}` : ""}</td>
                      <td className="py-1 pr-2">{r.preview.systems.join(", ")}</td>
                      <td className="py-1">
                        {r.errors.map((e, i) => (
                          <p key={`e${i}`} className="text-red-700">{t("importRowN")} {r.rowNumber}: {issueText(e)}</p>
                        ))}
                        {r.warnings.map((w, i) => (
                          <p key={`w${i}`} className="text-amber-700">{issueText(w)}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link href="/mapping" className="rounded border border-primary px-4 py-2 text-sm text-primary">{t("cancelImport")}</Link>
            <button
              type="button"
              disabled={importable.length === 0 || blockedAsDuplicate}
              onClick={() => setStage("confirm")}
              className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {t("continueToConfirm")}
            </button>
          </div>
        </section>
      )}

      {preview && stage === "confirm" && (
        <section className="space-y-3">
          <h2 className="font-medium">{t("importConfirmTitle")}</h2>
          <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt>{t("importWillCreate")}</dt>
            <dd className="font-medium">{importable.length}</dd>
            <dt>{t("importWarningsAccepted")}</dt>
            <dd className="font-medium">{warningRows.length}</dd>
            <dt>{t("importRowsExcluded")}</dt>
            <dd className="font-medium">{errorRows.length}</dd>
            <dt>{t("importDuplicateWarnings")}</dt>
            <dd className="font-medium">{duplicateWarnings}</dd>
          </dl>
          <p className="text-sm">{fill(t("importExistingEffect"), { n: preview.existingCount, m: importable.length })}</p>

          <form action={confirmImportAction} onSubmit={() => setSubmitting(true)} className="space-y-3">
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="payload" value={payload} />
            {warningRows.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="acceptedWarnings"
                  value="yes"
                  checked={acceptedWarnings}
                  onChange={(e) => setAcceptedWarnings(e.target.checked)}
                  className="mt-1"
                />
                {t("importAckWarnings")}
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/mapping" className="rounded border border-primary px-4 py-2 text-sm text-primary">{t("cancelImport")}</Link>
              <button type="button" onClick={() => setStage("preview")} className="rounded border border-primary px-4 py-2 text-sm text-primary">
                {t("backToPreview")}
              </button>
              <button
                disabled={submitting || (warningRows.length > 0 && !acceptedWarnings)}
                className="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {t("confirmImportFinal")}
              </button>
            </div>
          </form>
        </section>
      )}

      {!preview && <Link href="/mapping" className="text-sm text-primary underline">{t("back")}</Link>}
    </div>
  );
}
