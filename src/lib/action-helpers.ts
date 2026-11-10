import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/** Runs a mutation, then redirects. Expected failures become ?error=<message key> on `returnTo`. */
export async function attempt(returnTo: string, fn: () => Promise<void>, onSuccess: string = returnTo): Promise<never> {
  try {
    await fn();
  } catch (e) {
    const sep = returnTo.includes("?") ? "&" : "?";
    if (e instanceof AppError) redirect(`${returnTo}${sep}error=${e.code}`);
    if (e instanceof z.ZodError) redirect(`${returnTo}${sep}error=errInvalidInput`);
    throw e;
  }
  redirect(onSuccess);
}

export const formString = (f: FormData, key: string) => String(f.get(key) ?? "");

/** Accepts only in-app admin paths for post-action redirects; anything else falls back. */
export function safeReturnPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/admin/") || value.includes("//") || value.includes("\\") || value.includes(":")) return fallback;
  return value;
}
