import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const FORMAT = "scrypt";

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(secret, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return [FORMAT, SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts[0] !== FORMAT || parts.length !== 6) return false;

  const salt = Buffer.from(parts[4]!, "base64url");
  const expected = Buffer.from(parts[5]!, "base64url");
  const actual = await deriveKey(secret, salt, expected.length, { N: Number(parts[1]!), r: Number(parts[2]!), p: Number(parts[3]!) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function deriveKey(secret: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
