import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(0).max(65535).default(4317),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FBR_SANDBOX_TOKEN: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().min(1).optional()),
  FBR_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(20_000),
});

export const env = envSchema.parse(process.env);
