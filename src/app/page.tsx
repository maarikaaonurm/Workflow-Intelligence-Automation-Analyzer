import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getOwnMapping } from "@/lib/services/mapping";
import { getOwnDiary } from "@/lib/services/diary";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t } = await getT();
  // Participant home: status of my own Initial Activity Mapping (any department role that participates).
  const mapping = user.actor.departmentRole !== null ? await getOwnMapping(user.actor) : null;
  const diary = mapping ? await getOwnDiary(user.actor, { days: 1 }) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {t("welcome")}, {user.name}
      </h1>
      <ul className="mt-2 text-gray-600">
        {user.actor.isOrgAdmin && <li>{t("organizationPrivilege")}: {t("roleADMIN")}</li>}
        {user.actor.departmentRole ? (
          <li>
            {t("department")}: {user.departmentName} · {t("role")}: {t(`role${user.actor.departmentRole}`)}
          </li>
        ) : (
          <li>{t("noDepartment")}</li>
        )}
      </ul>
      {mapping && (
        <section className="mt-6 space-y-2 rounded border border-gray-200 p-4">
          <h2 className="font-medium">{t("mappingStatusHeading")}</h2>
          <p className="text-sm text-gray-600">
            {mapping.campaign.name} · {t(`mapStatus${mapping.status}`)}
          </p>
          <Link href="/mapping" className="inline-block rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark">
            {t(mapping.status === "NOT_STARTED" ? "startMapping" : mapping.status === "DRAFT" ? "continueMapping" : "viewMapping")}
          </Link>
        </section>
      )}
      {diary && (
        <section className="mt-4 space-y-3 rounded border border-gray-200 p-4">
          <h2 className="font-medium">{t("myDiary")}</h2>
          <p className="text-sm text-gray-600">
            {diary.campaign.name} · {t(`status${diary.status}`)} · {t("daysRemaining")}: {diary.daysRemaining}
          </p>
          {diary.reminder.due && <p role="status" className="rounded bg-surface p-2 text-sm">{t("reminderText")}</p>}
          <div className="flex flex-wrap gap-2">
            {diary.perms.create && diary.participant.status === "ACTIVE" && diary.acknowledged && (
              <>
                <Link href="/diary/new" className="rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark">{t("logActivity")}</Link>
                <Link href="/diary/timer" className="rounded border border-primary px-3 py-1 text-sm text-primary">{diary.timer ? t("openTimer") : t("startTimer")}</Link>
                <Link href="/diary/quick" className="rounded border border-primary px-3 py-1 text-sm text-primary">{t("quickAdd")}</Link>
              </>
            )}
            <Link href="/diary" className="rounded border border-primary px-3 py-1 text-sm text-primary">{t("myDiary")}</Link>
          </div>
          {diary.favorites.length > 0 && diary.perms.create && (
            <div className="flex flex-wrap gap-2 text-sm">
              {diary.favorites.map((f) => (
                <Link key={f.id} href={`/diary/new?activity=${f.id}`} className="rounded border border-gray-200 px-2 py-1 text-primary underline">★ {f.version.name}</Link>
              ))}
            </div>
          )}
          <p className="text-sm">
            {t("todayEntries")}: {diary.todayEntries.length} · {diary.todayMinutes} {t("minutesShort")}
          </p>
          <p className="text-sm text-gray-600">
            {t("coverageLine").replace("{done}", String(diary.coverage.daysWithEntries)).replace("{eligible}", String(diary.coverage.eligibleDays))}
          </p>
          <p className="text-xs text-gray-500">{t("nextReminder")}: {diary.reminder.enabled ? diary.reminder.time : t("reminderOff")}</p>
        </section>
      )}
      <p className="mt-6 rounded bg-surface p-4">{t("nextSteps")}</p>
    </div>
  );
}
