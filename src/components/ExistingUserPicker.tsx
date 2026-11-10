"use client";

import { useMemo, useState } from "react";

export interface PickerUser {
  id: string;
  name: string;
  departmentName: string | null;
  roleLabel: string | null;
}
export interface PickerGroup {
  key: string;
  label: string;
  users: PickerUser[];
}

interface Props {
  groups: PickerGroup[];
  departmentId: string;
  returnTo: string;
  /** When set, the role is fixed (the manager picker) and no role select is shown. */
  fixedRole?: "MANAGER";
  labels: Record<string, string>;
}

/**
 * Searchable, grouped chooser for existing users. Selecting someone only shows who they
 * are and where they belong now; submitting goes to a confirmation page, nothing changes here.
 */
export function ExistingUserPicker({ groups, departmentId, returnTo, fixedRole, labels }: Props) {
  const t = (key: string) => labels[key] ?? key;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, users: g.users.filter((u) => q === "" || u.name.toLowerCase().includes(q)) }))
      .filter((g) => g.users.length > 0);
  }, [groups, query]);

  const selected = groups.flatMap((g) => g.users).find((u) => u.id === selectedId);

  return (
    <form method="get" action="/admin/membership/confirm" className="space-y-3">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {fixedRole && <input type="hidden" name="role" value={fixedRole} />}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchUsers")}
        aria-label={t("searchUsers")}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />

      <div className="max-h-64 space-y-3 overflow-y-auto rounded border border-gray-200 p-3 text-sm">
        {visible.length === 0 && <p className="text-gray-600">{t("noMatches")}</p>}
        {visible.map((g) => (
          <fieldset key={g.key}>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</legend>
            <ul className="mt-1 space-y-1">
              {g.users.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="userId"
                      value={u.id}
                      required
                      checked={selectedId === u.id}
                      onChange={() => setSelectedId(u.id)}
                    />
                    <span>
                      {u.name}
                      {u.roleLabel && <span className="text-gray-500"> — {u.roleLabel}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>

      {selected && (
        <p className="rounded bg-surface p-3 text-sm" aria-live="polite">
          <span className="font-medium">{selected.name}</span>
          <br />
          {selected.departmentName ? (
            <>
              {t("currentDepartment")}: {selected.departmentName} · {t("currentRole")}: {selected.roleLabel}
            </>
          ) : (
            t("noActiveDepartment")
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!fixedRole && (
          <label className="flex items-center gap-2 text-sm">
            {t("role")}
            <select name="role" defaultValue="EMPLOYEE" className="rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="EMPLOYEE">{t("roleEMPLOYEE")}</option>
              <option value="MANAGER">{t("roleMANAGER")}</option>
            </select>
          </label>
        )}
        <button disabled={!selected} className="rounded bg-primary px-3 py-1 text-sm text-white hover:bg-primary-dark disabled:opacity-50">
          {t("reviewChange")}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t("nothingChangesYet")}</p>
    </form>
  );
}
