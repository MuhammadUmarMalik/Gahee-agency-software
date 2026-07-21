import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup, retentionIds } from "./backup.service.js";

describe("encrypted SQLite backup container", () => {
  it("round-trips bytes with AES-256-GCM and a SHA-256 checksum", () => {
    const database = Buffer.from("SQLite format 3\0test database bytes");
    const key = randomBytes(32);
    const encrypted = encryptBackup(database, key, new Date("2026-07-20T00:00:00Z"));
    expect(encrypted.file.equals(database)).toBe(false);
    expect(encrypted.header.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decryptBackup(encrypted.file, key)).toEqual(database);
  });

  it("rejects a modified encrypted backup", () => {
    const key = randomBytes(32);
    const encrypted = encryptBackup(Buffer.from("SQLite format 3\0data"), key);
    const last = encrypted.file.length - 1;
    encrypted.file[last] = encrypted.file[last]! ^ 1;
    expect(() => decryptBackup(encrypted.file, key)).toThrow(/authentication failed/i);
  });
});

describe("backup retention", () => {
  it("keeps the union of 7 daily, 4 weekly, and 6 monthly restore points", () => {
    const rows = Array.from({ length: 240 }, (_, index) => ({ id: String(index), createdAt: new Date(Date.UTC(2026, 6, 20 - index)) }));
    const keep = retentionIds(rows);
    expect(keep.size).toBeGreaterThanOrEqual(7);
    expect(keep.size).toBeLessThanOrEqual(17);
    expect([...Array(7).keys()].every((id) => keep.has(String(id)))).toBe(true);
  });
});
