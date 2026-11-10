import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  setUserMembership: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
}));

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ actor: { id: "admin", organizationId: "org", role: "ADMIN", departmentId: null } }),
}));
vi.mock("@/lib/services/users", () => mocks);

import { confirmMembershipAction, createUserAction, deactivateUserAction } from "./user-actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const run = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  return null;
};

beforeEach(() => {
  for (const fn of Object.values(mocks)) (fn as any).mockReset().mockResolvedValue(undefined);
});

describe("transfer confirmation gate", () => {
  const base = { userId: "u1", departmentId: "cm", role: "EMPLOYEE", returnTo: "/admin/departments/cm" };

  it("does not change anything until the confirmation step has been submitted", async () => {
    const url = await run(() => confirmMembershipAction(form(base)));
    expect(url).toBe("/admin/membership/confirm?userId=u1&departmentId=cm&role=EMPLOYEE&returnTo=%2Fadmin%2Fdepartments%2Fcm");
    expect(mocks.setUserMembership).not.toHaveBeenCalled();
  });

  it("does not accept anything other than confirmed=yes", async () => {
    await run(() => confirmMembershipAction(form({ ...base, confirmed: "true" })));
    await run(() => confirmMembershipAction(form({ ...base, confirmed: "1" })));
    expect(mocks.setUserMembership).not.toHaveBeenCalled();
  });

  it("transfers once confirmed and returns to the department page", async () => {
    const url = await run(() => confirmMembershipAction(form({ ...base, confirmed: "yes" })));
    expect(url).toBe("/admin/departments/cm");
    expect(mocks.setUserMembership).toHaveBeenCalledTimes(1);
    expect(mocks.setUserMembership.mock.calls[0].slice(1)).toEqual(["u1", { departmentId: "cm", role: "EMPLOYEE" }, false]);
  });

  it("passes the campaign acknowledgement only when the box was ticked", async () => {
    await run(() => confirmMembershipAction(form({ ...base, confirmed: "yes", ackCampaigns: "on" })));
    expect(mocks.setUserMembership.mock.calls[0][3]).toBe(true);
  });

  it("sends a service refusal back to the confirmation page with the error", async () => {
    mocks.setUserMembership.mockRejectedValue(new AppError("errCampaignImpact"));
    const url = await run(() => confirmMembershipAction(form({ ...base, confirmed: "yes" })));
    expect(url).toContain("/admin/membership/confirm?");
    expect(url).toContain("&error=errCampaignImpact");
  });

  it("ignores an unsafe return path", async () => {
    const url = await run(() => confirmMembershipAction(form({ ...base, returnTo: "https://evil.example", confirmed: "yes" })));
    expect(url).toBe("/admin/users/u1");
  });
});

describe("creating a user from a department page", () => {
  const person = { firstName: "Kati", lastName: "Rebane", email: "kati@demo.example", role: "EMPLOYEE" };

  it("assigns the department that was preset and returns to that department", async () => {
    const url = await run(() =>
      createUserAction(form({ ...person, departmentId: "cm", returnTo: "/admin/departments/cm" })),
    );
    expect(url).toBe("/admin/departments/cm");
    expect(mocks.createUser.mock.calls[0].slice(1)).toEqual([
      { firstName: "Kati", lastName: "Rebane", email: "kati@demo.example" },
      { departmentId: "cm", role: "EMPLOYEE" },
    ]);
  });

  it("returns to the Users page when created from there", async () => {
    const url = await run(() => createUserAction(form({ ...person, departmentId: "acc" })));
    expect(url).toBe("/admin/users");
  });

  it("reports a duplicate email on the page it came from", async () => {
    mocks.createUser.mockRejectedValue(new AppError("errEmailTaken"));
    const url = await run(() => createUserAction(form({ ...person, departmentId: "cm", returnTo: "/admin/departments/cm" })));
    expect(url).toBe("/admin/departments/cm?error=errEmailTaken");
  });
});

describe("deactivation gate", () => {
  it("also requires the confirmation step", async () => {
    const url = await run(() => deactivateUserAction(form({ userId: "u1" })));
    expect(url).toBe("/admin/users/u1/confirm");
    expect(mocks.deactivateUser).not.toHaveBeenCalled();
  });
});
