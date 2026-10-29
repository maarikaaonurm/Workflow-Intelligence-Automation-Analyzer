import { db } from "@/lib/db";
import { devLoginEnabled } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { devLogin } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { t } = await getT();
  if (!devLoginEnabled()) return <p>{t("devLoginDisabled")}</p>;

  const users = await db.user.findMany({
    where: { active: true },
    include: { memberships: { where: { active: true }, include: { department: true } } },
    orderBy: [{ isOrgAdmin: "desc" }, { name: "asc" }],
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("signIn")}</h1>
      <p className="mb-4 text-gray-600">{t("tagline")}</p>
      <h2 className="mb-2 font-medium">{t("demoAccounts")}</h2>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {users.map((u) => {
          const m = u.memberships[0];
          const role = u.isOrgAdmin ? "ADMIN" : (m?.role ?? "EMPLOYEE");
          return (
            <li key={u.id} className="flex items-center justify-between px-4 py-2">
              <span>
                {u.name} <span className="text-sm text-gray-500">{t(`role${role}`)}{m ? ` · ${m.department.name}` : ""}</span>
              </span>
              <form action={devLogin}>
                <input type="hidden" name="userId" value={u.id} />
                <button className="rounded bg-primary px-3 py-1 text-white hover:bg-primary-dark">{t("signIn")}</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
