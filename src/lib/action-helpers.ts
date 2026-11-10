import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/** Runs a mutation, then redirects. Expected failures become ?error=<message key> on `returnTo`. */
export async function attempt(returnTo: string, fn: () => Promise<void>, onSuccess: string = returnTo): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) redirect(`${returnTo}?error=${e.code}`);
    if (e instanceof z.ZodError) redirect(`${returnTo}?error=errInvalidInput`);
    throw e;
  }
  redirect(onSuccess);
}

export const formString = (f: FormData, key: string) => String(f.get(key) ?? "");
