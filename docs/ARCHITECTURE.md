# Oil Agency POS — Architecture and Delivery Plan

## 1. Project architecture

The application is a local-first modular monolith. Electron owns the desktop lifecycle and starts the Express API on `127.0.0.1` using an ephemeral port. React never receives database file access; it calls the loopback API with a short-lived bearer token. Express owns validation, permissions, transactions, ledger rules, and Prisma access. SQLite is the single source of truth.

```text
Electron main process
  ├─ starts local Express API
  ├─ owns native print/backup dialogs
  └─ opens one hardened BrowserWindow
          │ preload (small, typed IPC allow-list)
          ▼
React renderer ──HTTP──> Express modules ──> domain services ──> Prisma ──> SQLite
```

Key decisions:

- Money is stored as integer paisa (`amountMinor`) to avoid floating-point errors.
- Quantities are integer smallest units. `unitsPerPack` converts cartons to pieces.
- All inventory, sale, purchase, ledger, and cashbook mutations run in a Prisma transaction.
- Stock balance is a cached projection on `Product`/`ProductBatch`; `StockMovement` is the immutable audit source.
- Ledger balances are derived from immutable ledger entries, not manually editable totals.
- Business states use Prisma enums and shared Zod input schemas. SQLite stores enum values as text; Prisma enforces them at the ORM boundary.
- Soft deletion is used for master data. Financial documents are voided, never deleted.
- Electron uses `contextIsolation`, disables Node integration, and binds the API to loopback only.

## 2. Folder structure

```text
apps/
  api/src/
    app.ts                 Express composition
    server.ts              standalone development entry
    config/                environment parsing
    lib/                   Prisma, errors, security helpers
    middleware/            auth, permissions, errors
    modules/<module>/       route, validation, service
  desktop/
    electron/              main and preload processes
    src/
      api/                 typed HTTP client
      components/          shared application UI
      features/<feature>/  feature UI and state
      pages/               route-level components
      stores/              Zustand stores
      styles/              Tailwind entry
packages/
  shared/src/              DTOs, constants, Zod contracts
prisma/
  schema.prisma
  seed.ts
docs/
  ARCHITECTURE.md
```

## 3. Prisma schema

The complete schema is in `prisma/schema.prisma`. It covers users/roles, master data, batches, immutable stock movement, purchases, sales, both ledgers, payments, returns, damage/expiry, cashbook, settings, audit logs, sessions, and login history.

## 4. API modules

| Module | Base route | Responsibilities |
|---|---|---|
| Auth | `/api/auth` | login, logout, current session, lockout |
| Users | `/api/users` | user CRUD, roles, cashier discount limit |
| Dashboard | `/api/dashboard` | role-filtered operational summary |
| Catalog | `/api/products`, `/api/categories`, `/api/brands`, `/api/units` | master data and packing |
| Inventory | `/api/inventory` | opening/adjustment movements, balances, batches, expiry |
| Suppliers | `/api/suppliers` | supplier master and statement |
| Purchases | `/api/purchases` | receive stock, payment allocation, supplier ledger |
| Customers | `/api/customers` | customer master, credit limit, statement |
| Sales | `/api/sales` | POS checkout, owner discount approval, invoice |
| Payments | `/api/payments` | customer receipt and supplier payment |
| Returns | `/api/sales-returns` | original-invoice return and stock reversal |
| Wastage | `/api/wastage` | damaged/expired stock-out |
| Cashbook | `/api/cashbook` | immutable cash inflow/outflow and daily close |
| Reports | `/api/reports` | stock, expiry, sales, purchases, ledgers; sensitive RBAC |
| Printing | `/api/print` + IPC | thermal HTML and PDF invoice payloads |
| Backup | `/api/backups` + IPC | checkpoint, copy, verify, restore workflow |

All list endpoints use `page`, `pageSize`, `search`, and explicit sort fields. Mutating requests support an `Idempotency-Key` where duplicate submission would affect money or stock.

## 5. Desktop pages

- Login
- Dashboard
- POS / New Sale
- Sales History and Invoice Detail
- Sales Return
- Products, Product Form, Categories, Brands, Units
- Stock On Hand, Stock Movements, Adjustment, Batches and Expiry
- Purchases, New Purchase, Purchase Detail
- Suppliers and Supplier Statement
- Customers and Customer Khata
- Payments
- Damage / Expired Stock
- Cashbook and Daily Closing
- Reports: daily sales, purchases, stock, low stock, expiry, customer dues, supplier dues
- Users and Roles (owner)
- Settings, Printing, Backup and Restore (owner/admin as applicable)

Cashier navigation never renders profit, cash-in-hand, purchase-cost, owner settings, or sensitive report links. The API independently enforces the same restriction.

## 6. Implementation order

1. Foundation, authentication, roles, audit, application shell
2. Category/brand/unit/product management with packing and opening stock
3. Inventory transaction service, batches, stock movement and expiry
4. Supplier/customer masters and immutable ledgers
5. Purchase transaction and supplier payments
6. POS sale transaction, discount approval, customer receipts
7. Sales returns tied to invoice; damage/expiry write-off
8. Cashbook projection and daily closing
9. Role-filtered reports
10. Thermal/PDF printing and verified local backup
11. Packaging, recovery testing, performance and UAT

## 7. Risks and validations

| Risk | Required control |
|---|---|
| Partial document writes | One database transaction for document, stock, ledger, cashbook, and audit rows |
| Negative stock under rapid sales | Re-check stock inside the write transaction; update with guarded quantity predicate |
| Unit conversion errors | Accept carton/piece input, normalize once to integer smallest units, persist conversion snapshot on line item |
| Money rounding | Integer paisa only; tax/discount rounding is centralized and tested |
| Batch mismatch | Allocate sale quantities by explicit batch or FEFO; validate batch belongs to product |
| Duplicate submission | Idempotency key plus unique invoice/reference numbers |
| Ledger drift | Append-only entries with source type/id uniqueness; reconciliation report |
| Unauthorized sensitive data | Permission middleware and response DTO filtering; UI hiding is secondary |
| Excess cashier discount | Server calculates discount percentage and requires a short-lived owner PIN approval token over the configured limit |
| Weak local credentials | Argon2 password hash, generic login errors, five-attempt lockout, expiring hashed sessions |
| Corrupt/incomplete backup | SQLite checkpoint, atomic copy, checksum, and restore only while API is stopped |
| SQLite contention | WAL mode, short transactions, busy timeout, single API writer process |
| Accidental historical edits | Soft-delete master data; void/reversal workflow for posted documents |

Mandatory validation boundaries are shared Zod input contracts, database uniqueness/foreign keys, service-level business invariants, and integration tests against a temporary SQLite database.
