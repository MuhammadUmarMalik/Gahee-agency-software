export function isUniqueConstraintError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  if (code === "P2002" || code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  const message = "message" in error ? String(error.message) : "";
  return code === "SQLITE_CONSTRAINT" && /unique/i.test(message);
}
