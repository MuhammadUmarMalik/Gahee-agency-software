import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { ExpenseController } from "./expense.controller.js";
import { ExpenseService } from "./expense.service.js";

export function createExpenseRouter(db: PrismaClient) {
  const router = Router();
  const controller = new ExpenseController(new ExpenseService(db));
  router.use(authenticate(db));
  router.get("/categories", requirePermission(PERMISSIONS.CASHBOOK_VIEW), controller.categories);
  router.post("/categories", requirePermission(PERMISSIONS.EXPENSES_MANAGE), controller.createCategory);
  router.patch("/categories/:id", requirePermission(PERMISSIONS.EXPENSES_MANAGE), controller.updateCategory);
  router.get("/", requirePermission(PERMISSIONS.CASHBOOK_VIEW), controller.list);
  router.post("/", requirePermission(PERMISSIONS.EXPENSES_MANAGE), controller.create);
  router.post("/:id/void", requirePermission(PERMISSIONS.EXPENSES_MANAGE), controller.void);
  return router;
}
