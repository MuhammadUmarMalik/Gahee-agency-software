import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { SaleController } from "./sale.controller.js";
import { SaleService } from "./sale.service.js";

export function createSaleRouter(db: AppDbClient) {
  const router = Router(), controller = new SaleController(new SaleService(db));
  router.use(authenticate(db));
  const pos = requirePermission(PERMISSIONS.POS_USE);
  const salesView = requirePermission(PERMISSIONS.SALES_VIEW);
  router.get("/options", pos, controller.options);
  router.get("/search", pos, controller.search);
  router.get("/holds", pos, controller.holds);
  router.post("/holds", pos, controller.hold);
  router.delete("/holds/:id", pos, controller.removeHold);
  router.get("/fbr/status", requirePermission(PERMISSIONS.SETTINGS_MANAGE), controller.fbrStatus);
  router.get("/sales", salesView, controller.list);
  router.get("/sales/:id", salesView, controller.invoice);
  router.patch("/sales/:id", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.updateMetadata);
  router.post("/sales/:id/fbr/validate", requirePermission(PERMISSIONS.SETTINGS_MANAGE), controller.validateFbr);
  router.post("/sales/:id/fbr/submit", requirePermission(PERMISSIONS.SETTINGS_MANAGE), controller.submitFbr);
  router.post("/sales/:id/void", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.void);
  router.delete("/sales/:id", requirePermission(PERMISSIONS.ACCOUNTING_MANAGE), controller.void);
  router.post("/checkout", pos, controller.checkout);
  return router;
}
