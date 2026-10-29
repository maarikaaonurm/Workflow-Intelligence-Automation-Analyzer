import { cookies } from "next/headers";
import { normalizeLocale, translator } from "./messages";

export const LOCALE_COOKIE = "wia_locale";

export async function getT() {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, t: translator(locale) };
}
