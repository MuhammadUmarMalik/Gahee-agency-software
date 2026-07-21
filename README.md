# Oil Agency POS

Desktop-first, local-only management software for a single cooking oil and ghee agency.

The architecture and complete delivery plan are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The domain database is defined in [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts) and managed through Drizzle migrations in [drizzle](drizzle).

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

## Database locations and startup

- Electron development: `<repository>/data/agency.db`
- Packaged Electron: `path.join(app.getPath("userData"), "oil-agency-pos", "app.db")`
- Standalone API, Drizzle CLI, and seed script: `DATABASE_URL`, defaulting to `file:./data/agency.db` resolved from the current working directory
- Packaged migrations: `path.join(process.resourcesPath, "drizzle")`

Electron sets `DATABASE_URL` to its resolved database before importing the API database module. Startup creates the parent directory, enables foreign keys/WAL/a busy timeout, runs committed Drizzle migrations, verifies `PRAGMA database_list` and all required tables, idempotently seeds required reference data, and only then starts Express and loads the dashboard. Migration failure is fatal and is written with the database path to `startup-error.log` under Electron's user-data directory.

The installed app never runs `drizzle-kit push` and never copies an empty template over an existing database. Pending migrations are applied in place.

### Native SQLite ABI

Node-based commands (`drizzle-kit`, seeds, API tests) and Electron require different `better-sqlite3` native ABIs. The database scripts automatically run `npm run native:node`; Electron development and packaging automatically run `npm run native:electron`. If a command is interrupted while switching runtimes, run the matching command explicitly before retrying:

```bash
npm run native:node      # before drizzle-kit, seed, or API commands
npm run native:electron  # before Electron development or packaging
```

## Verification

```bash
npm run db:generate
npm run typecheck
npm run build
```

Application data is stored in Electron's per-user application-data directory. The renderer has no direct filesystem or database access.

## Create a Windows installer (.exe)

`npm run build` only compiles the app into temporary folders (`apps/desktop/dist` and `apps/desktop/dist-electron`). It does **not** create an installer you can copy to another PC.

To build a Windows installer:

```bash
npm install
npm run dist:desktop
```

When it finishes, open:

- `apps/desktop/release/Oil Agency POS Setup 0.1.0.exe` — installer for other computers
- `apps/desktop/release/win-unpacked/Oil Agency POS.exe` — portable unpacked app (useful for testing)

Copy the **Setup** `.exe` to the target PC, run it, and install the app like any normal Windows program.

Notes:

- The first build can take several minutes because Electron and native modules are downloaded and packaged.
- Windows may show a SmartScreen warning for unsigned apps. That is expected until the app is code-signed.
- Each installed copy keeps its own local database under the user's AppData folder.
