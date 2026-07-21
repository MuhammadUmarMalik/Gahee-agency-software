import "dotenv/config";
import { env } from "./config/env.js";
import { migrateDatabase, resolveDatabasePath, resolveMigrationsFolder } from "./lib/database-startup.js";
import { startDailyClosingScheduler } from "./modules/cashbook/daily-closing.scheduler.js";

const databasePath = resolveDatabasePath();
console.info(`[startup] development API database: ${databasePath}`);
migrateDatabase(databasePath, resolveMigrationsFolder());
const { createApp } = await import("./app.js");

const server = createApp().listen(env.API_PORT, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : env.API_PORT;
  console.log(`Oil Agency API listening on http://127.0.0.1:${port}`);
});
const stopDailyClosingScheduler = startDailyClosingScheduler(databasePath);

function shutdown() { stopDailyClosingScheduler(); server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
