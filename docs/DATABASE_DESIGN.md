# Database Design

## Design invariants

The canonical data model is [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts). It targets Drizzle ORM and SQLite.

- Every monetary value uses an integer minor-unit field such as `totalMinor`. For PKR, `125050` means PKR 1,250.50. No `Float` is used for money.
- Every inventory quantity uses an integer base-unit field such as `quantityBase`. A product whose base unit is bottle and whose carton packing has `unitsPerPack = 12` stores two cartons plus five bottles as `29`.
- `ProductPacking` defines presentation/purchase/sale units. A piece packing uses `unitsPerPack = 1`; a carton packing may use `12`, `24`, or another product-specific conversion.
- `Product.stockOnHandBaseQty` and `ProductBatch.stockOnHandBaseQty` are cached balances for fast POS reads. `StockMovement` is the append-only source of truth.
- Money, stock, ledger, cashbook, document, and audit rows must be written in one database transaction.
- Posted commercial documents are voided with reversing entries. They are never hard-deleted or edited in place.

## Relationships

### Access control

`Role` and `Permission` have a many-to-many relationship through `RolePermission`. Every `User` has one role. `Session`, `LoginHistory`, and `AuditLog` retain authentication and change history. A `DiscountApproval` ties a short-lived approval to both the requesting cashier and approving owner.

### Catalog and packing

`Product` optionally belongs to one `Category` and `Brand`, and always has one smallest `Unit` as `baseUnit`. It has many `ProductPacking` rows. Packing values are snapshotted onto purchase and sale lines so changing a carton from 12 to 10 units cannot rewrite historical quantities.

### Inventory and batches

`Product` has many `ProductBatch` rows and `StockMovement` rows. A movement contains a signed `quantityBase`, the product balance after posting, an optional batch balance, and an idempotent `(sourceType, sourceId, sourceLineId)` key. Batch number uniqueness is scoped to a product.

Positive movement examples are opening stock, purchase, sales return, and adjustment-in. Negative examples are sale, damage, expiry, purchase return, and adjustment-out.

### Sales, purchases, and payments

`Sale` has many `SaleItem` rows and optionally belongs to a `Customer`. `Purchase` has many `PurchaseItem` rows and always belongs to a `Supplier`. Both documents snapshot prices, conversions, totals, payment state, creator, and transaction date.

`Payment` supports multiple receipts/payments against one sale or purchase, enabling partial settlement. Party and direction fields distinguish customer receipts from supplier payments. Cash methods generate a related `CashbookEntry`; non-cash methods remain visible in payments without changing cash in hand.

### Ledgers

`CustomerLedger` and `SupplierLedger` are append-only debit/credit journals. Their generic `sourceType/sourceId` pair provides idempotency and source navigation, while explicit nullable foreign keys cover the principal sale, purchase, payment, and sales-return sources.

Customer convention:

- Sale/positive opening receivable: debit
- Customer payment or sales return: credit

Supplier convention:

- Purchase/positive opening payable: credit
- Supplier payment: debit

Balances are calculated as customer `SUM(debitMinor - creditMinor)` and supplier `SUM(creditMinor - debitMinor)`.

### Returns, wastage, and cashbook

Every `SalesReturn` references its original `Sale`; every `SalesReturnItem` references its original `SaleItem`. `DamageEntry` distinguishes damaged and expired quantities. Both workflows must create stock movements.

`Expense`, `Payment`, and cash-refunded `SalesReturn` rows link to append-only `CashbookEntry` rows. `DailyClosing` stores the calculated and counted closing values for one unique business date.

### Configuration and audit

`Setting` stores small JSON-encoded configuration values by stable key. `AuditLog` records actor, enum action, entity identity, before/after JSON text, IP address, and timestamp. Secrets must be encrypted before being placed in `Setting`; password and PIN hashes belong on `User` and are never audited as plaintext.

## Seed data structure

The idempotent seed implementation is [`scripts/seed.ts`](../scripts/seed.ts). It creates:

1. Stable permission codes such as `pos:use`, `inventory:adjust`, and `reports:sensitive`.
2. System roles `OWNER`, `ADMIN`, and `CASHIER`, followed by their role-permission join rows.
3. One owner from `SEED_OWNER_USERNAME`, `SEED_OWNER_PASSWORD`, and `SEED_OWNER_PIN`, hashing credentials with Argon2.
4. Base units: bottle, carton, and pouch.
5. Categories: Cooking Oil and Ghee.
6. A `business` setting containing the default name, PKR currency, and Asia/Karachi timezone.

Production seeds should not create sample financial transactions. Optional demo data belongs in a separate, development-only seed so real opening balances and stock cannot be confused with examples.

## Migration notes

1. Use Drizzle 6.2 or newer; SQLite enum support was added in 6.2. This project pins Drizzle 6.8.
2. Generate and inspect the initial migration with `npm run db:migrate -- --name initial`. Keep the generated SQL under version control.
3. SQLite stores text enums as text. Drizzle validates them, but direct SQL can still write invalid text. If any tool writes outside Drizzle, add `CHECK` constraints for enum columns in the reviewed migration.
4. Add SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers that abort changes to `StockMovement`, `CustomerLedger`, `SupplierLedger`, and `CashbookEntry`. Drizzle schema syntax cannot declare triggers.
5. Enable `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, and a sensible `busy_timeout` on each application connection.
6. Back up the database and run `PRAGMA integrity_check` before deployment migrations. SQLite table-altering migrations often rebuild tables, so test them against a copy of realistic data.
7. Data backfills must translate old free-form status strings to enum values before the application reads them. Reject unknown values rather than silently coercing them.
8. Packaged releases use Drizzle's `better-sqlite3` runtime migrator against committed SQL files. `drizzle-kit migrate` is only a development/deployment CLI; never use schema push against a production agency database.
9. After each inventory-affecting migration, reconcile cached product/batch balances with the sum of immutable stock movements.

Example append-only trigger to include in the reviewed SQL migration:

```sql
CREATE TRIGGER stock_movement_no_update
BEFORE UPDATE ON StockMovement
BEGIN
  SELECT RAISE(ABORT, 'StockMovement is immutable');
END;

CREATE TRIGGER stock_movement_no_delete
BEFORE DELETE ON StockMovement
BEGIN
  SELECT RAISE(ABORT, 'StockMovement is immutable');
END;
```

Equivalent triggers are required for both ledgers and the cashbook.

## Validation risks

| Risk | Required validation |
|---|---|
| Invalid carton conversion | `unitsPerPack > 0`; exactly one active base/piece packing with conversion 1; at most one default purchase and sale packing per product |
| Fractional stock | Reject fractional inputs after conversion; persist only integer base quantities |
| Negative stock | Re-read and conditionally update product and batch balances inside the posting transaction; affected-row count must equal one |
| Batch mismatch | Batch must belong to the same product; expiry must follow manufacture date; tracked products require a batch |
| Duplicate document posting | Unique invoice numbers and movement/ledger/cashbook source keys; treat unique conflicts as idempotent retries |
| Incorrect totals | Recalculate line totals, discount, tax, paid amount, and payment status on the server; never trust client totals |
| Invalid payment party | Customer receipt requires customer plus `IN`; supplier payment requires supplier plus `OUT`; amount must be positive |
| Credit sale without customer | `PARTIAL` or `UNPAID` sale requires a customer; enforce credit limit in the same transaction |
| Ledger imbalance | Exactly one of debit or credit must be positive and the other zero; source party must match document party |
| Excess return | Sum of prior posted return quantities plus new quantity cannot exceed the original sale-item quantity |
| Return batch error | Returned batch must match the original sale allocation unless an authorized quarantine workflow records otherwise |
| Damage/expiry drift | Quantity must be positive and available in the chosen product/batch before posting the negative movement |
| Soft-delete uniqueness | Deleted master records keep unique SKU/code/name values; reactivate or rename rather than silently duplicating identity |
| Enum corruption | Prevent direct database writes or add migration `CHECK` constraints; SQLite itself does not enforce text enums |
| Integer overflow | Application limits must keep every `Int` money value below 2,147,483,647 minor units; move monetary fields to `BigInt` if that ceiling is insufficient |
| Concurrent writers | Keep transactions short, use WAL/busy timeout, and retry only recognized SQLite busy errors |
| Historical deletion | No hard-delete endpoints for posted documents, movements, ledgers, cashbook, returns, payments, or audit logs |
