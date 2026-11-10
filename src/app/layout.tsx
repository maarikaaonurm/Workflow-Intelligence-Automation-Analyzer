import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth/session";
import { capabilitiesOf } from "@/lib/auth/policy";
import { findOwnCampaign } from "@/lib/services/mapping";
import { getT } from "@/lib/i18n/server";
import { logout, setLocale } from "./actions";

export const metadata: Metadata = {
  title: "Workflow Intelligence & Automation Analyzer",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, { locale, t }] = await Promise.all([getCurrentUser(), getT()]);
  const caps = user ? capabilitiesOf(user.actor) : null;
  // The campaign the user takes part in themselves (any department role), for "My campaign status".
  const ownCampaign = user && caps?.myWork ? await findOwnCampaign(user.actor) : null;

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
        {user && caps && (
          <nav aria-label={t("navigation")} className="flex flex-wrap items-start gap-x-10 gap-y-2 border-b border-gray-200 px-6 py-2 text-sm">
            <Link href="/">{t("home")}</Link>
            {/* One account, several areas: each group appears when the user has that capability. */}
            {caps.organization && (
              <NavGroup label={t("navOrganization")}>
                <Link href="/admin/users">{t("users")}</Link>
                <Link href="/admin/departments">{t("departments")}</Link>
                <Link href="/admin/reference">{t("referenceData")}</Link>
              </NavGroup>
            )}
            {caps.management && (
              <NavGroup label={t("navManagement")}>
                <Link href="/campaigns">{t("campaigns")}</Link>
              </NavGroup>
            )}
            {caps.myWork && (
              <NavGroup label={t("navMyWork")}>
                <Link href="/mapping">{t("myMapping")}</Link>
                {ownCampaign && <Link href={`/campaigns/${ownCampaign.id}`}>{t("myCampaignStatus")}</Link>}
              </NavGroup>
            )}
            <Link href="/categories">{t("categoryGuide")}</Link>
          </nav>
        )}
        <main className="mx-auto max-w-4xl p-6">{children}</main>
      </body>
    </html>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="flex gap-4">{children}</div>
    </div>
  );
}
