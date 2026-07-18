import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { PERMISSIONS, ROLE_PERMISSIONS, type AuthUser } from "@oil-agency/shared";
import { HttpError } from "../lib/http-error.js";
import { requirePermission } from "./require-permission.js";
import { requireRole } from "./require-role.js";

function requestFor(user: AuthUser): Request {
  return { auth: { ...user, sessionId: "session-id" } } as Request;
}

const cashier: AuthUser = {
  id: "cashier-id",
  username: "cashier",
  displayName: "Cashier",
  role: "CASHIER",
  permissions: [...ROLE_PERMISSIONS.CASHIER],
  cashierDiscountLimitBps: 200,
};

describe("access control middleware", () => {
  it("allows a cashier to use POS", () => {
    const next = vi.fn();
    requirePermission(PERMISSIONS.POS_USE)(requestFor(cashier), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("blocks a cashier from sensitive reports and cashbook", () => {
    expect(cashier.permissions).not.toContain(PERMISSIONS.REPORTS_SENSITIVE);
    expect(cashier.permissions).not.toContain(PERMISSIONS.CASHBOOK_VIEW);
    for (const permission of [PERMISSIONS.REPORTS_SENSITIVE, PERMISSIONS.CASHBOOK_VIEW]) {
      const next = vi.fn();
      requirePermission(permission)(requestFor(cashier), {} as Response, next);
      const error = next.mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(403);
    }
  });

  it("requires the owner role for protected settings", () => {
    const next = vi.fn();
    requireRole("OWNER")(requestFor(cashier), {} as Response, next);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(403);
  });
});
