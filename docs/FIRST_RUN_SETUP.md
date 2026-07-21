# Clean builds and first-run owner setup

Production builds package the committed Drizzle SQL migrations under `resources/drizzle`. They do not package or copy a template database.

On first launch Electron creates `path.join(app.getPath("userData"), "oil-agency-pos", "app.db")`, enables the required SQLite pragmas, applies all migrations, and idempotently seeds only required system data such as roles, permissions, units, settings, accounts, expense categories, and the current financial period. It contains no users or operational transactions. On upgrades, the same runtime migrator applies only pending migrations to the existing database and never overwrites it.

Older builds used `path.join(app.getPath("userData"), "agency.db")`. When the new path does not yet exist, startup makes an integrity-checked SQLite backup of that legacy database at the new path before migrating it. The legacy file is retained as a fallback.

With no users in a new database, the login screen becomes a one-time Owner setup screen. The user selects:

- Owner display name
- Username
- Strong password and confirmation
- Owner PIN and confirmation

The API hashes the password and PIN with Argon2, creates the Owner and an audit record in one transaction, then prevents the setup endpoint from being used again. The Owner can create Admin and Cashier accounts after signing in.

If migration or schema verification fails, Electron does not start the API or dashboard. It displays a startup error and records the database path and error in `startup-error.log` under the application user-data directory.
