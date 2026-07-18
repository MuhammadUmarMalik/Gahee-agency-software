# Authentication and Authorization

## Roles

Permissions are defined once in `packages/shared/src/auth.ts` and seeded into the database.

- `OWNER`: all permissions, user administration, protected settings, backup, cashbook, and sensitive reporting.
- `ADMIN`: operational and sensitive reporting permissions, excluding owner user/settings controls.
- `CASHIER`: POS, sales, returns, parties, payments, and basic reports. It does not receive `cashbook:view` or `reports:sensitive`.

The API is authoritative. Hiding React navigation is only a usability measure and never substitutes for `authenticate`, `requirePermission`, or `requireRole` middleware.

## Endpoints

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/login` | Public, rate-limited |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/logout` | Authenticated |
| GET | `/api/users` | `users:manage` |
| POST | `/api/users` | `users:manage` |
| PATCH | `/api/users/:id` | `users:manage` |
| PUT | `/api/users/:id/password` | `users:manage` |
| GET | `/api/settings` | Owner role only |
| PUT | `/api/settings/:key` | Owner role only |
| POST | `/api/approvals/discount` | `pos:use`, PIN rate-limited |

Future sensitive report endpoints must use `requirePermission(PERMISSIONS.REPORTS_SENSITIVE)`. Cashbook endpoints must use `requirePermission(PERMISSIONS.CASHBOOK_VIEW)`.

## Credential and session controls

- Passwords and owner PINs are Argon2 hashes; plaintext values are never persisted or audited.
- New/reset passwords require 10–128 characters with uppercase, lowercase, and numeric characters.
- Five consecutive failed password attempts lock the account for 15 minutes.
- Login requests have an additional IP-based limit of 30 attempts per 15 minutes.
- Unknown accounts execute a dummy Argon2 verification to reduce username timing differences.
- Sessions use 256-bit random bearer tokens. Only SHA-256 token hashes are stored in SQLite.
- Sessions expire after the configured TTL and are revoked on logout, password reset, role change, activation change, or account deletion/deactivation.
- The React renderer keeps its bearer token in Zustand memory only. Closing or refreshing the renderer requires a new login.
- Login success/failure is stored in `LoginHistory`; user changes and password resets are stored in `AuditLog` without credential hashes.
- The API prevents deactivating oneself and prevents removing the final active owner.

## Desktop boundary

The API listens only on `127.0.0.1`. Electron enables context isolation, disables renderer Node integration, denies new windows, and loads a restrictive Content Security Policy. The preload bridge exposes only non-secret desktop metadata.
