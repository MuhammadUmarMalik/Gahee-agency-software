import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/agency.db";

export default defineConfig({
  schema: "./apps/api/src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseUrl.replace(/^file:/, ""),
  },
  strict: true,
  verbose: true,
});
