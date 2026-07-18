import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { startDailyClosingScheduler } from "./modules/cashbook/daily-closing.scheduler.js";

const server = createApp().listen(env.API_PORT, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : env.API_PORT;
  console.log(`Oil Agency API listening on http://127.0.0.1:${port}`);
});
const stopDailyClosingScheduler = startDailyClosingScheduler(prisma);

function shutdown() { stopDailyClosingScheduler(); server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
