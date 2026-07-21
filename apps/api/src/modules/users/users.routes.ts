import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { Router } from "express";
import { createUserInputSchema, PERMISSIONS, resetPasswordInputSchema, updateUserInputSchema } from "@oil-agency/shared";
import { z } from "zod";
import { isUniqueConstraintError } from "../../lib/db-errors.js";
import { HttpError } from "../../lib/http-error.js";
import { hashSecret } from "../../lib/password.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";

const userIdSchema = z.string().min(1).max(64);

const userSelect = {
  id: true, username: true, displayName: true, isActive: true,
  cashierDiscountLimitBps: true, lastLoginAt: true, createdAt: true,
  role: { select: { code: true, name: true } },
} satisfies Record<string, unknown>;

export function createUsersRouter(db: AppDbClient): Router {
  const router = Router();
  router.use(authenticate(db), requirePermission(PERMISSIONS.USERS_MANAGE));

  router.get("/", async (_req, res) => {
    const users = await db.user.findMany({ where: { deletedAt: null }, select: userSelect, orderBy: { displayName: "asc" } });
    res.json({ users });
  });

  router.post("/", async (req, res) => {
    const input = createUserInputSchema.parse(req.body);
    const role = await db.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new HttpError(400, "INVALID_ROLE", "Selected role does not exist.");
    try {
      const passwordHash = await hashSecret(input.password);
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({ data: {
          username: input.username, displayName: input.displayName,
          passwordHash, roleId: role.id,
          cashierDiscountLimitBps: input.roleCode === "CASHIER" ? input.cashierDiscountLimitBps : 0,
        }, select: userSelect });
        await tx.auditLog.create({ data: { userId: req.auth!.id, action: "CREATE", entityType: "User", entityId: created.id, afterJson: JSON.stringify(created) } });
        return created;
      });
      res.status(201).json({ user });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new HttpError(409, "USERNAME_EXISTS", "That username is already in use.");
      throw error;
    }
  });

  router.patch("/:id", async (req, res) => {
    const userId = userIdSchema.parse(req.params.id);
    const input = updateUserInputSchema.parse(req.body);
    if (userId === req.auth!.id && input.isActive === false) throw new HttpError(400, "SELF_DISABLE", "You cannot disable your own account.");
    const role = input.roleCode ? await db.role.findUnique({ where: { code: input.roleCode } }) : null;
    if (input.roleCode && !role) throw new HttpError(400, "INVALID_ROLE", "Selected role does not exist.");
    const before = await db.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!before) throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
    const removesOwnerAccess = before.role.code === "OWNER" && (input.isActive === false || (input.roleCode !== undefined && input.roleCode !== "OWNER"));
    if (removesOwnerAccess) {
      const otherOwners = await db.user.count({ where: { id: { not: userId }, isActive: true, deletedAt: null, role: { code: "OWNER" } } });
      if (otherOwners === 0) throw new HttpError(409, "LAST_OWNER", "Create another active owner before changing this account.");
    }
    const user = await db.$transaction(async (tx) => {
      const effectiveRole = input.roleCode ?? before.role.code;
      const updated = await tx.user.update({ where: { id: userId }, data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(role ? { roleId: role.id } : {}),
        ...(effectiveRole === "CASHIER" && input.cashierDiscountLimitBps !== undefined ? { cashierDiscountLimitBps: input.cashierDiscountLimitBps } : {}),
        ...(effectiveRole !== "CASHIER" ? { cashierDiscountLimitBps: 0 } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      }, select: userSelect });
      if (input.roleCode !== undefined || input.isActive !== undefined) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const action = input.isActive === false ? "DEACTIVATE" : input.isActive === true && !before.isActive ? "ACTIVATE" : "UPDATE";
      await tx.auditLog.create({ data: { userId: req.auth!.id, action, entityType: "User", entityId: updated.id, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(updated) } });
      return updated;
    });
    res.json({ user });
  });

  router.put("/:id/password", async (req, res) => {
    const userId = userIdSchema.parse(req.params.id);
    const { password } = resetPasswordInputSchema.parse(req.body);
    const passwordHash = await hashSecret(password);
    await db.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: { id: userId, deletedAt: null }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } });
      if (!result.count) throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: req.auth!.id, action: "RESET_PASSWORD", entityType: "User", entityId: userId } });
    });
    res.status(204).send();
  });

  return router;
}
