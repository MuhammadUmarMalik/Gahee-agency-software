import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { PurchaseController } from "./purchase.controller.js";
import { PurchaseService } from "./purchase.service.js";

export function createPurchaseRouter(db: AppDbClient) {
  const router = Router(), controller = new PurchaseController(new PurchaseService(db));
  router.use(authenticate(db), requirePermission(PERMISSIONS.PURCHASES_MANAGE));
  router.get("/options", controller.options);
  router.get("/duplicate-invoice", controller.duplicate);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/", controller.create);
  router.put("/:id", controller.update);
  router.post("/:id/payments", controller.pay);
  router.post("/:id/void", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.void);
  router.delete("/:id", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.remove);
  return router;
}
