import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { PermissionCode, RoleCode } from "@oil-agency/shared";
import { HttpError } from "../lib/http-error.js";
import { hashToken } from "../lib/security.js";

export function authenticate(db: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer ")) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in.");
      const token = header.slice(7).trim();
      const session = await db.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive || session.user.deletedAt) {
        throw new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
      }
      req.auth = {
        sessionId: session.id,
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role.code as RoleCode,
        permissions: session.user.role.permissions.map(({ permission }) => permission.code as PermissionCode),
        cashierDiscountLimitBps: session.user.cashierDiscountLimitBps,
      };
      next();
    } catch (error) { next(error); }
  };
}
