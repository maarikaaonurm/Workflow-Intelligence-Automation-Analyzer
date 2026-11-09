import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { logout, setLocale } from "./actions";

export const metadata: Metadata = {
  title: "Workflow Intelligence & Automation Analyzer",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, { locale, t }] = await Promise.all([getCurrentUser(), getT()]);

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white antialiased">
        <header className="flex items-center justify-between border-b border-gray-200 bg-surface px-6 py-3">
          <span className="font-semibold text-primary">{t("appName")}</span>
          <div className="flex items-center gap-4 text-sm">
            {user && (
              <span>
                {user.name}
                {user.departmentName ? ` · ${user.departmentName}` : ""}
              </span>
            )}
            <form action={setLocale} className="flex gap-2">
              <input type="hidden" name="returnTo" value="/" />
              <button name="locale" value="en" className={locale === "en" ? "font-bold" : ""}>English</button>
              <button name="locale" value="et" className={locale === "et" ? "font-bold" : ""}>Eesti</button>
            </form>
            {user && (
              <form action={logout}>
                <button className="text-primary underline">{t("signOut")}</button>
              </form>
            )}
          </div>
        </header>
        {user && (
          <nav className="flex gap-6 border-b border-gray-200 px-6 py-2 text-sm">
            <Link href="/">{t("home")}</Link>
            <Link href="/campaigns">{t("campaigns")}</Link>
            <Link href="/admin/departments">{t("departments")}</Link>
          </nav>
        )}
        <main className="mx-auto max-w-4xl p-6">{children}</main>
      </body>
    </html>
  );
}
