import type { AppDbClient } from "../../../api/src/lib/db.js";

export async function assertOfflineSyncSchema(db: AppDbClient) {
  const saleColumns = await db.$queryRawUnsafe<Array<{ name: string }>>("PRAGMA table_info('Sale')");
  const requiredColumns = ["fbrPayloadHash", "fbrRequestJson", "fbrQrData", "fbrRetryCount"];
  const missingColumns = requiredColumns.filter((name) => !saleColumns.some((column) => column.name === name));
  if (missingColumns.length)
    throw new Error(`Sale migrations are incomplete. Missing columns: ${missingColumns.join(", ")}`);
}
