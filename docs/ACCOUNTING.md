# Accounting subsystem

The accounting subsystem extends the existing POS workflows. Sales, purchases, payments, stock movements, party ledgers, expenses, returns, and the cashbook remain operational records. Each posting service now creates an immutable, balanced journal in the same Prisma transaction.

## Source of truth

- Financial statements use `JournalEntry` and `JournalLine` only.
- Customer and supplier ledgers remain the party-aging subledgers and reconcile to the AR and AP control accounts.
- The cashbook remains the physical cash-drawer record and reconciles to the Cash in Hand account.
- Product quantity remains in the smallest configured unit. `averageCostMinor` and `inventoryValueMinor` maintain weighted-average inventory value.
- Posted financial records are never deleted. Corrections use source-document reversal, which also reverses connected journals, ledger entries, cashbook entries, and stock movements.

## Standard automatic postings

| Source | Debit | Credit |
|---|---|---|
| Sale invoice | Receivables, COGS, sales discounts | Sales, output tax, inventory |
| Customer receipt | Cash or bank | Receivables |
| Purchase invoice | Inventory including landed cost, input tax | Supplier payables |
| Supplier payment | Supplier payables | Cash or bank |
| Expense | Mapped expense account | Cash or bank clearing |
| Sales return | Sales returns and saleable inventory | Cash/receivables and COGS |
| Purchase return | Supplier payables | Inventory and input tax |
| Damage/expiry/leak/missing | Inventory loss | Inventory |
| Owner investment | Cash/bank | Owner capital |
| Owner withdrawal | Owner drawings | Cash/bank |
| Cash/bank transfer | Destination account | Source account |

## Existing database cutover

Run the schema migration before starting the updated application:

```sh
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

For an existing agency database, back it up first. Then call `POST /api/accounting/cutover` once with an owner session and:

```json
{
  "cutoverDate": "2026-07-17",
  "note": "Accounting opening balances at system cutover"
}
```

The cutover creates one balanced opening journal from current cashbook, receivable, payable, bank-clearing, and inventory balances. It is intentionally blocked after any journal exists. Historical operational reports remain available, while journal-based financial statements begin at the cutover date.

## Controls

- `sourceType + sourceId + postingKey` prevents duplicate journal posting.
- Every journal line contains exactly one positive debit or credit.
- Total debit must equal total credit before insertion.
- Closed or locked financial periods reject new postings and reversals.
- Closed cash days reject all later cash sales, payments, refunds, expenses, and adjustments.
- System account classifications cannot be edited.
- Source-linked journals cannot be reversed directly; their source document must be reversed.
- Locked periods cannot be reopened.

## Permissions

- `accounting:view`: accounts, periods, and journal inquiry
- `accounting:manage`: journals, source reversals, capital, and transfers
- `accounting:periods`: accounting cutover and period control
- `accounting:reports`: journal-based financial statements
- `accounting:banks`: bank account setup
- `cashbook:manage` and `cashbook:close`: separated from read-only cashbook access
