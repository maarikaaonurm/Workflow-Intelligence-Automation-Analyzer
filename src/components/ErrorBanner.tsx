import { messages, type MessageKey } from "@/lib/i18n/messages";

/** Shows an expected failure; `code` comes from ?error= and is only used if it is a known message key. */
export function ErrorBanner({ code, t }: { code?: string; t: (key: MessageKey) => string }) {
  if (!code || !(code in messages.en)) return null;
  return (
    <p role="alert" className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {t(code as MessageKey)}
    </p>
  );
}
