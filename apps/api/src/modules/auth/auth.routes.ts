import { Router } from "express";
import type { AppDbClient } from "../../lib/db.js";
import { loginInputSchema, setupOwnerInputSchema } from "@oil-agency/shared";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

export function createAuthRouter(db: AppDbClient): Router {
  const router = Router();
  const service = new AuthService(db);
  const controller = new AuthController(service);
  const requireAuth = authenticate(db);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "LOGIN_RATE_LIMITED", message: "Too many sign-in attempts. Try again later." } },
  });
  const setupLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: { code: "SETUP_RATE_LIMITED", message: "Too many setup attempts. Restart the application and try again later." } },
  });

  router.get("/setup-status", controller.setupStatus);
  router.post("/setup-owner", setupLimiter, validateBody(setupOwnerInputSchema), controller.setupOwner);
  router.post("/login", loginLimiter, validateBody(loginInputSchema), controller.login);
  router.get("/me", requireAuth, controller.me);
  router.post("/logout", requireAuth, controller.logout);

  return router;
}
