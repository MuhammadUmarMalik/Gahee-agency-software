# Reporting module implementation

## Phase 1 analysis

The application is an Electron/React desktop client backed by Express, Prisma, and SQLite. Reporting reuses the existing `ReportService`, journal-based `AccountingService`, API authentication middleware, permission constants, business branding store, and Electron print/PDF IPC.

### Relevant modules and schema

- Sales, sale items, payments, sales returns, customers, and customer ledger
- Purchases, purchase items, purchase returns, suppliers, and supplier ledger
- Products, categories, brands, batches, stock movements, damage entries, and stock counts
- Expenses, cashbook, daily closing, accounts, journals, periods, bank accounts, and financial transactions
- Users, roles, permissions, sessions, login history, and audit logs

The application has one business location. It has no warehouse, employee HR, attendance, payroll, salary, or commission model; reports for those domains were intentionally not invented.

### Existing reports before this implementation

- Sales invoices, daily/product/customer sales, and cash/credit settlements
- Purchase details, daily purchases, and supplier totals
- Current/low stock, batches, near-expiry/expired stock, and write-offs
- Customer and supplier ledgers/balances
- Expenses and cashbook
- General ledger, trial balance, profit and loss, balance sheet, cash flow, receivables, and payables
- CSV, branded print/PDF, and basic party/product/category/payment filters

### Missing capabilities addressed

- Separately selectable period, operational, party, financial, and audit reports
- Sales cost/profit, category/staff, pending, tax, discount, and return analysis
- Purchase return, outstanding, and tax/discount analysis
- Inventory valuation, out-of-stock, movement, and adjustment analysis
- Payment histories, login history, audit logs, deleted records, and change history
- Date presets, brand/staff filters, charts, search, sorting, pagination, per-column filters, sticky headers, column visibility, and footer totals
- Real `.xlsx` export and complete print metadata/summary totals

## Implemented report catalogue

### Sales

Daily, weekly, monthly, yearly, invoice detail, customer, product, category, staff, sales returns, sales profit, pending payments, sales tax, and discounts.

### Purchases

Purchase summary, purchase returns, supplier purchases, outstanding supplier payments, and purchase tax/discount.

### Inventory

Current stock, low stock, out of stock, movements, valuation, inventory adjustments, damaged/expired stock, expiring products, and batches.

### Customers and suppliers

Customer ledger, balances, purchase history, outstanding customers, top customers, supplier ledger, balances, payment history, and purchase history.

### Financial

Profit and loss with net revenue, cost of goods sold, gross profit, gross margin, other income, operating expenses, net profit/loss and net margin; plus expenses, cash flow, cash in hand, general ledger, trial balance/trial sheet, balance sheet, payment history, receivables, payables, tax summary, discount summary, and cashbook.

### User and audit

Login history, audit logs, user activity, deleted records, and before/after data change history.

## Business logic and queries

- Only `POSTED` business documents contribute to operational and financial reports.
- Date boundaries use the existing Asia/Karachi business-day helper.
- Sales profit uses the immutable sale-item cost captured when the invoice was posted, avoiding later product-cost changes.
- Inventory valuation uses maintained average cost and inventory value fields; movement history uses indexed product/date and source references.
- Customer/supplier balances use their immutable ledgers; statutory financial statements continue to use posted balanced journal entries.
- Return reports exclude voided returns and preserve original document/party references.
- Audit/login queries are capped at 5,000 rows per request; the UI paginates locally and provides searchable/filterable columns.
- Existing indexes cover document date/status, party/date, product/date, batch/date, audit user/date, audit entity/date, journal date/status, and account/journal access paths.

## Security and permissions

- Basic operational reports require `reports:basic`.
- Sensitive purchasing, payment, expense, cashbook, and summary APIs require `reports:sensitive` and the Owner role.
- Journal-sourced financial reports require `accounting:reports`.
- Audit and login reports require `users:manage` and the Owner role.
- Reports are removed from the client catalogue when the signed-in user lacks permission; API middleware remains the authoritative enforcement layer.

## Modified reporting files

- `packages/shared/src/report.ts`: advanced filter and audit schemas
- `apps/api/src/modules/reports/report.service.ts`: operational, inventory, payment, financial-summary, and audit queries
- `apps/api/src/modules/reports/report.controller.ts`: validated report handlers
- `apps/api/src/modules/reports/report.routes.ts`: permission-protected routes
- `apps/api/src/modules/reports/report.service.test.ts`: filter validation coverage
- `apps/desktop/src/pages/reports-page.tsx`: report catalogue, filters, summaries, charts, and exports
- `apps/desktop/src/features/reports/report-table.tsx`: reusable searchable/sortable/paginated table
- `apps/desktop/src/features/reports/report-chart.tsx`: dynamic bar/line/area/pie visualization
- `apps/desktop/src/features/reports/export-helpers.ts`: branded print/PDF/CSV/XLSX output
- `apps/desktop/package.json` and `package-lock.json`: spreadsheet writer dependency

Small TypeScript compatibility corrections were also made in accounting and purchase-return controllers/services so the full workspace typecheck succeeds; these do not alter business behavior.

## Verification checklist

- [x] Shared, API, and desktop TypeScript compilation
- [x] Production Vite renderer/Electron bundle
- [x] Reporting schema tests
- [x] Accounting posting tests
- [x] Access-control tests
- [x] Read-only runtime smoke test of every newly added query family against the local database
- [x] Dependency audit: spreadsheet exporter introduces no advisory; the remaining high advisory is the pre-existing Electron 36 dependency
- [x] `git diff --check`

The complete API suite currently has one unrelated pre-existing mocked `ProductService` test failure because its transaction mock does not include the journal model, and the SQLite integration setup cannot spawn `npx.cmd` in the current environment. Reporting-focused tests pass.

## Edge cases covered

- Reversed/invalid date ranges
- Empty datasets and zero totals
- Walk-in customers and missing optional party data
- Unpaid/partial/non-cash settlements
- Product/category/brand combinations
- Expired and near-expiry batches
- Voided documents and reversed payments
- Negative balances/party advances
- Missing general-ledger account selection
- Failed login events and system-generated audit records
- Wide tables and large result sets

## Remaining recommendations

- Upgrade Electron from 36 to a currently supported major release in a dedicated compatibility change; `npm audit` flags the existing version.
- Add server-side cursor pagination for individual detail tables if data grows beyond the current 5,000-row audit ceiling or multi-year operational exports become common.
- Add database integration fixtures for every report query once the Windows test runner issue is corrected.
- Add a warehouse domain only if the business moves from its current single-location model.
