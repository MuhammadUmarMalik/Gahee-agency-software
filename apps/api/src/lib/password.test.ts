import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "./password.js";

describe("password hashing", () => {
  it("hashes and verifies secrets without native dependencies", async () => {
    const hash = await hashSecret("StrongOwner123");

    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifySecret(hash, "StrongOwner123")).resolves.toBe(true);
    await expect(verifySecret(hash, "wrong-password")).resolves.toBe(false);
  });

  it("rejects unsupported legacy hash formats instead of loading native modules", async () => {
    await expect(verifySecret("$argon2id$v=19$m=65536,t=3,p=4$legacy$hash", "StrongOwner123")).resolves.toBe(false);
  });
});
