# Oil Agency POS

Desktop-first, local-only management software for a single cooking oil and ghee agency.

The architecture and complete delivery plan are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The domain database is defined in [prisma/schema.prisma](prisma/schema.prisma).

## Implemented

Module 1 is a complete vertical slice:

- Electron application shell with hardened renderer settings
- React login and owner user-management screens
- Username/password authentication using Argon2
- Five-attempt, 15-minute account lockout
- Hashed, expiring, revocable local sessions
- Owner/Admin/Cashier roles and permission middleware
- Owner PIN discount approval tokens for POS use
- Request throttling for login and owner-PIN attempts
- Session revocation after role, activation, or password changes
- Final-active-owner protection
- Owner-role-only settings API
- Memory-only renderer session tokens and a restrictive CSP
- Login history and user-change audit records
- Seeded system roles, permissions, base units, categories, and owner account

No screens for later modules are linked until their API and business transaction are implemented.

## Prerequisites

- Node.js 22 LTS
- npm 10+

## Local setup

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate -- --name initial
npm run db:seed
npm run dev
```

Set `SEED_OWNER_PASSWORD` and `SEED_OWNER_PIN` before running the seed. The password must contain at least 10 characters with uppercase, lowercase, and numeric characters; the PIN must contain 4–12 digits. Seeding fails when either value is omitted. The seed is idempotent and does not reset an existing owner's password or PIN.

The standalone API can be started with `npm run dev:api`. The Electron development command starts its own loopback API, so the two development commands should not run on port 4317 simultaneously.

## Verification

```bash
npm run db:generate
npx prisma validate
npm run typecheck
npm run build
```

Application data is stored in Electron's per-user application-data directory. The renderer has no direct filesystem or database access.
