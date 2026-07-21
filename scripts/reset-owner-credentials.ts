import Database from "better-sqlite3";
import { hashSecret } from "../apps/api/src/lib/password.js";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/agency.db";
const databasePath = databaseUrl.replace(/^file:/, "");
const username = process.env.OWNER_USERNAME?.trim().toLowerCase() || "owner";
const password = process.env.OWNER_PASSWORD;
const ownerPin = process.env.OWNER_PIN;

if (!password || !ownerPin) {
  throw new Error("Set OWNER_PASSWORD and OWNER_PIN before running this script.");
}

const db = new Database(databasePath);

try {
  const owner = db.prepare(`
    SELECT "User"."id"
    FROM "User"
    JOIN "Role" ON "Role"."id" = "User"."roleId"
    WHERE "User"."username" = ? AND "Role"."code" = 'OWNER' AND "User"."deletedAt" IS NULL
    LIMIT 1
  `).get(username) as { id: string } | undefined;

  if (!owner) throw new Error(`Active owner user '${username}' was not found.`);

  const passwordHash = await hashSecret(password);
  const ownerPinHash = await hashSecret(ownerPin);

  db.prepare(`
    UPDATE "User"
    SET "passwordHash" = ?, "ownerPinHash" = ?, "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = ?
    WHERE "id" = ?
  `).run(passwordHash, ownerPinHash, new Date().toISOString(), owner.id);

  db.prepare('UPDATE "Session" SET "revokedAt" = ? WHERE "userId" = ? AND "revokedAt" IS NULL').run(new Date().toISOString(), owner.id);
  console.log(`Updated owner credentials for '${username}'.`);
} finally {
  db.close();
}
