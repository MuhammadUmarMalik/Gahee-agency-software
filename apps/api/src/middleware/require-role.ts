import type { NextFunction, Request, Response } from "express";
import type { RoleCode } from "@oil-agency/shared";
import { HttpError } from "../lib/http-error.js";

export function requireRole(...allowedRoles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new HttpError(401, "UNAUTHENTICATED", "Please sign in."));
    if (!allowedRoles.includes(req.auth.role)) return next(new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action."));
    next();
  };
}
