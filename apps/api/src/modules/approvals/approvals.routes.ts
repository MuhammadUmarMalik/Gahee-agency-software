import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ownerPinSchema, PERMISSIONS } from "@oil-agency/shared";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";
import { hashToken } from "../../lib/security.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";

const approvalSchema = z.object({
  ownerPin: ownerPinSchema,
  discountBps: z.number().int().min(1).max(10_000),
});

export function createApprovalsRouter(db: PrismaClient): Router {
  const router = Router();
  router.use(authenticate(db), requirePermission(PERMISSIONS.POS_USE));
  const pinLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "PIN_RATE_LIMITED", message: "Too many PIN attempts. Try again later." } },
  });
  router.post("/discount", pinLimiter, async (req, res) => {
    const input = approvalSchema.parse(req.body);
    const owners = await db.user.findMany({ where: { isActive: true, deletedAt: null, role: { code: "OWNER" }, ownerPinHash: { not: null } } });
    let owner: (typeof owners)[number] | undefined;
    for (const candidate of owners) {
      if (candidate.ownerPinHash && await argon2.verify(candidate.ownerPinHash, input.ownerPin)) { owner = candidate; break; }
    }
    if (!owner) throw new HttpError(401, "INVALID_OWNER_PIN", "Owner PIN is incorrect.");
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 2 * 60_000);
    await db.discountApproval.create({ data: { tokenHash: hashToken(token), requestedById: req.auth!.id, approvedById: owner.id, discountBps: input.discountBps, expiresAt } });
    res.status(201).json({ token, expiresAt: expiresAt.toISOString(), discountBps: input.discountBps });
  });
  return router;
}
