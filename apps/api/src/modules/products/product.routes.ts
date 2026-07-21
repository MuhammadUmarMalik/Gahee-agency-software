import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { PERMISSIONS } from "@oil-agency/shared";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { ProductController } from "./product.controller.js";
import { ProductService } from "./product.service.js";

export function createProductRouter(db: AppDbClient): Router {
  const router = Router();
  const controller = new ProductController(new ProductService(db));
  router.use(authenticate(db), requirePermission(PERMISSIONS.PRODUCTS_MANAGE));
  router.get("/options", controller.options);
  router.get("/generate-barcode", controller.barcode);
  router.get("/generate-sku", controller.sku);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/", controller.create);
  router.patch("/:id/restore", controller.restore);
  router.put("/:id", controller.update);
  router.delete("/:id", controller.remove);
  return router;
}
