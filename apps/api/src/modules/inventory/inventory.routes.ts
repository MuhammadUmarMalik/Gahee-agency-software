import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";

export function createInventoryRouter(db: AppDbClient) {
  const router = Router(); const controller = new InventoryController(new InventoryService(db));
  router.use(authenticate(db));
  router.get("/stock", requirePermission(PERMISSIONS.INVENTORY_VIEW), controller.stock);
  router.get("/options", requirePermission(PERMISSIONS.INVENTORY_VIEW), controller.options);
  router.get("/movements", requirePermission(PERMISSIONS.INVENTORY_VIEW), controller.movements);
  router.get("/users", requirePermission(PERMISSIONS.INVENTORY_VIEW), controller.users);
  router.get("/counts", requirePermission(PERMISSIONS.INVENTORY_VIEW), controller.counts);
  router.post("/adjustments", requirePermission(PERMISSIONS.INVENTORY_ADJUST), controller.adjust);
  router.post("/write-offs", requirePermission(PERMISSIONS.INVENTORY_ADJUST), controller.writeOff);
  router.post("/carton-open", requirePermission(PERMISSIONS.INVENTORY_ADJUST), controller.cartonOpen);
  router.post("/counts", requirePermission(PERMISSIONS.INVENTORY_ADJUST), controller.count);
  return router;
}
