import type { AppDbClient } from "../../lib/db.js";
import { Router } from "express";
import { z } from "zod";
import { backupSettingSchema, businessSettingSchema, DEFAULT_BACKUP_SETTING, DEFAULT_BUSINESS_SETTING, DEFAULT_PRINTING_SETTING, DEFAULT_SHORTCUT_SETTING, printingSettingSchema, shortcutSettingSchema } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

const keySchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/);
const settingInputSchema = z.object({ value: z.unknown() });
const backupEventSchema = z.object({ fileName: z.string().trim().min(1).max(255), sizeBytes: z.number().int().positive().max(10_000_000_000) });
const settingSchemas = { business: businessSettingSchema, shortcuts: shortcutSettingSchema, printing: printingSettingSchema, backup: backupSettingSchema } as const;
type SettingJsonRow = { key: string; valueJson: string; updatedAt: Date };

function parseValue(valueJson: string): unknown {
  try { return JSON.parse(valueJson); }
  catch { return null; }
}

export function createSettingsRouter(db: AppDbClient): Router {
  const router = Router();
  router.use(authenticate(db));

  router.get("/client", async (_req, res) => {
    const rows = await db.setting.findMany({ where: { key: { in: ["business", "shortcuts", "printing"] }, isSecret: false } });
    const values = new Map(rows.map((row) => [row.key, parseValue(row.valueJson)]));
    res.json({
      business: businessSettingSchema.catch(DEFAULT_BUSINESS_SETTING).parse(values.get("business")),
      shortcuts: shortcutSettingSchema.catch(DEFAULT_SHORTCUT_SETTING).parse(values.get("shortcuts")),
      printing: printingSettingSchema.catch(DEFAULT_PRINTING_SETTING).parse(values.get("printing")),
    });
  });

  router.use(requireRole("OWNER"));

  router.get("/", async (_req, res) => {
    const settings = await db.setting.findMany({ where: { isSecret: false }, orderBy: { key: "asc" } });
    res.json({ settings: settings.map(({ key, valueJson, updatedAt }: SettingJsonRow) => ({ key, value: parseValue(valueJson), updatedAt })) });
  });

  router.get("/backup-status", async (_req, res) => {
    const event = await db.auditLog.findFirst({ where: { action: "BACKUP" }, select: { createdAt: true, afterJson: true, user: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } });
    res.json({ backup: event ? { createdAt: event.createdAt, createdBy: event.user?.displayName ?? "System", details: parseValue(event.afterJson ?? "null") } : null });
  });

  router.post("/backup-events", async (req, res) => {
    const details = backupEventSchema.parse(req.body);
    const event = await db.auditLog.create({ data: { userId: req.auth!.id, action: "BACKUP", entityType: "Database", entityId: details.fileName, afterJson: JSON.stringify(details) } });
    res.status(201).json({ event: { id: event.id, createdAt: event.createdAt } });
  });

  router.put("/:key", async (req, res) => {
    const key = keySchema.parse(req.params.key);
    const { value } = settingInputSchema.parse(req.body);
    const schema = settingSchemas[key as keyof typeof settingSchemas];
    if (!schema) throw new HttpError(400, "INVALID_SETTING_KEY", "This setting cannot be changed through the application.");
    const validated = schema.parse(value);
    const serialized = JSON.stringify(validated);
    if (serialized.length > 1_500_000) throw new HttpError(400, "INVALID_SETTING", "Setting value is too large.");
    const setting = await db.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key } });
      if (before?.isSecret) throw new HttpError(403, "SECRET_SETTING", "Secret settings cannot be changed through this endpoint.");
      const updated = await tx.setting.upsert({ where: { key }, update: { valueJson: serialized }, create: { key, valueJson: serialized } });
      await tx.auditLog.create({ data: { userId: req.auth!.id, action: before ? "UPDATE" : "CREATE", entityType: "Setting", entityId: key, ...(before ? { beforeJson: before.valueJson } : {}), afterJson: serialized } });
      return updated;
    });
    res.json({ setting: { key: setting.key, value: parseValue(setting.valueJson), updatedAt: setting.updatedAt } });
  });

  return router;
}
