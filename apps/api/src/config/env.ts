import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(0).max(65535).default(4317),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse(process.env);
