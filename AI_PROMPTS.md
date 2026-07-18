# Cooking Oil & Ghee Agency Software — AI Prompt Pack

Use these prompts with ChatGPT, Claude, Gemini, Cursor, Windsurf, GitHub Copilot, or another coding AI tool.

## 1. Master Project Prompt

```text
Act as a senior full-stack software architect and developer.

Build a desktop-first Cooking Oil and Ghee Agency Management System for a single-location business.

Technology stack:
- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zustand
- React Hook Form
- Zod
- Node.js
- Express
- Prisma
- SQLite

The application must be simple, fast, and suitable for non-technical users.

Core MVP modules:
1. Login and role permissions
2. Dashboard
3. Product management
4. Category, brand, and unit management
5. Carton and piece conversion
6. Inventory and stock movement
7. Batch and expiry tracking
8. Supplier management
9. Purchase management
10. Customer management
11. POS sales
12. Customer khata
13. Supplier ledger
14. Payments
15. Sales returns
16. Damaged and expired stock
17. Cashbook
18. Essential reports
19. Thermal and PDF printing
20. Local backup

Business rules:
- Store inventory in the smallest configured unit.
- Example: 1 carton = 12 bottles.
- Never update stock without creating a stock movement record.
- Block negative stock.
- Credit sale must update the customer ledger.
- Credit purchase must update the supplier ledger.
- Payment must create a ledger entry.
- Return must reference the original invoice.
- Cashier cannot view profit, loss, cash in hand, or sensitive reports.
- Owner PIN is required for discounts outside the cashier limit.

Do not add:
- Multi-branch support
- Full accounting
- FBR integration
- Cloud sync
- Trial balance
- Balance sheet
- Mobile app

First produce:
1. Project architecture
2. Folder structure
3. Prisma schema
4. API modules
5. Page list
6. Implementation order
7. Risks and validations

Then implement module by module.
Do not create placeholder code.
Return complete files with file paths.
```

## 2. Database Schema Prompt

```text
Act as a senior database architect.

Design a Prisma schema for a Cooking Oil and Ghee Agency Management System using SQLite.

Required entities:
- User
- Role
- Permission
- Product
- Category
- Brand
- Unit
- ProductPacking
- ProductBatch
- StockMovement
- Customer
- Supplier
- Sale
- SaleItem
- Purchase
- PurchaseItem
- Payment
- CustomerLedger
- SupplierLedger
- SalesReturn
- SalesReturnItem
- DamageEntry
- Expense
- CashbookEntry
- Setting
- AuditLog

Business rules:
- Product stock is stored in the smallest unit.
- One product can have carton and piece configuration.
- One product can have multiple batches.
- Stock movement must be immutable.
- Sales and purchases support cash, credit, and partial payment.
- Ledger entries reference their source transaction.
- Use soft delete where appropriate.
- Add indexes and unique constraints.
- Use decimal-safe money fields.
- Use enums for transaction types and statuses.

Return:
1. Complete schema.prisma
2. Relationship explanation
3. Seed data structure
4. Migration notes
5. Validation risks
```

## 3. Authentication and Roles Prompt

```text
Build secure authentication and role-based access control.

Roles:
- OWNER
- ADMIN
- CASHIER

Requirements:
- Username and password login
- Password hashing
- Active/inactive account
- Failed login attempts
- Temporary lock after repeated failures
- Login history
- Logout
- Current user endpoint
- Route permission middleware
- Owner-only settings
- Cashier restricted from sensitive reports
- Audit log for user changes

Create:
- Prisma models
- Auth service
- Auth controller
- Middleware
- Zod schemas
- React login page
- User management page
- Protected route component
- Zustand auth store

Return complete files with paths.
```

## 4. Product Management Prompt

```text
Build the product management module.

Fields:
- Product name
- Brand
- Category
- Product type
- Size value
- Size unit
- Base unit
- Purchase unit
- Sale unit
- Units per carton or pack
- SKU
- Barcode
- Barcode generation
- Purchase price
- Retail price
- Wholesale price
- Minimum price
- Tax rate
- Reorder level
- Opening stock
- Rack or location
- Notes
- Active status

Requirements:
- Product CRUD
- Search and filters
- Product form on one screen
- No separate inventory setup page
- Add opening stock during product creation
- Validate duplicate SKU and barcode
- Support carton and piece configuration
- Use React Hook Form and Zod
- Use shadcn/ui
- Use Prisma and Express API
- Add audit logs

Return API routes, controller, service, validation, React pages, table, form, and tests.
```

## 5. Inventory Engine Prompt

```text
Build the inventory engine.

Core rule:
Store stock in the smallest unit.

Example:
1 carton = 12 bottles
2 cartons + 5 bottles = 29 bottles

Requirements:
- Current stock
- Available stock
- Damaged stock
- Expired stock
- Returned stock
- Opening stock
- Stock adjustment
- Carton-to-piece conversion
- Negative stock blocking
- Low-stock alert
- Batch-aware stock
- Stock movement history
- User-wise stock changes
- Physical stock count
- Stock variance

Movement types:
- OPENING_STOCK
- PURCHASE
- SALE
- SALES_RETURN
- PURCHASE_RETURN
- DAMAGE
- EXPIRY
- ADJUSTMENT_IN
- ADJUSTMENT_OUT
- CARTON_OPEN

Never directly edit stock without a stock movement.

Create inventory service, transaction-safe stock update functions, conversion helpers, stock queries, API endpoints, React pages, and unit tests.
```

## 6. Purchase Module Prompt

```text
Build the purchase module.

Requirements:
- Supplier selection
- Supplier invoice number
- Purchase date and due date
- Cash, credit, and partial-payment purchase
- Product and batch selection
- Manufacturing and expiry date
- Carton and piece quantity
- Purchase rate
- Discount and tax
- Transport, loading, and other expenses
- Grand total, paid amount, and due amount
- Automatic stock update
- Supplier ledger update
- Purchase history
- Duplicate invoice warning

Use a database transaction so purchase, stock, payment, and supplier ledger update together.

Create Prisma models, service, controller, validation, purchase form, list, detail page, payment form, and tests.
```

## 7. POS Prompt

```text
Build a fast POS screen.

Requirements:
- Barcode scanner input
- Product and SKU search
- Category filter
- Carton or piece selector
- Retail or wholesale price
- Quantity change
- Customer selection
- Walk-in customer
- Cash, credit, partial, and mixed payment
- Discount and owner PIN approval
- Remove item
- Hold and resume sale
- Sale notes
- Automatic tax
- Keyboard shortcuts
- Touch-friendly layout
- Thermal print
- PDF print
- Reprint watermark

Rules:
- Block negative stock.
- Use FEFO batch suggestion.
- Block expired batches.
- Deduct stock in smallest units.
- Credit sale updates customer ledger.
- Cash sale updates cashbook.
- Use database transactions.

Create POS page, Zustand cart store, search API, checkout API, sale service, payment service, invoice component, print service, and tests.
```

## 8. Customer Khata Prompt

```text
Build the customer and khata module.

Customer fields:
- Name
- Business name
- Phone and WhatsApp
- Address
- CNIC or NTN
- Customer type
- Opening balance
- Credit limit
- Payment terms
- Active status

Khata requirements:
- Credit sale entry
- Payment received
- Manual debit or credit entry with reason
- Previous and current balance
- Due date and overdue amount
- Credit limit warning
- Credit sale block after limit
- Ledger statement
- Payment receipt
- Daily recovery list

Rules:
- Ledger entries are immutable.
- Corrections use reversal entries.
- Each ledger entry references the source transaction.

Create database models, CRUD, ledger service, payment service, customer pages, ledger table, payment form, statement print, and tests.
```

## 9. Supplier Ledger Prompt

```text
Build supplier management and supplier ledger.

Requirements:
- Supplier CRUD
- Opening balance
- Credit purchase
- Supplier payment
- Current payable balance
- Due date
- Outstanding report
- Supplier statement
- Last purchase date
- Active status

Rules:
- Credit purchase increases payable.
- Supplier payment reduces payable.
- Ledger entries are immutable.
- Reversal is used for cancellation.

Create supplier models, services, pages, ledger statement, and tests.
```

## 10. Sales Return Prompt

```text
Build the sales return module.

Requirements:
- Search original invoice
- Select original sale item
- Full and partial return
- Return reason
- Product condition: RESALABLE, DAMAGED, EXPIRED, OPENED
- Cash refund
- Customer balance adjustment
- Replacement support
- Return receipt
- Audit trail

Rules:
- Returned quantity cannot exceed sold quantity minus previous returns.
- Resalable stock returns to available stock.
- Damaged stock goes to damaged stock.
- Expired stock goes to expired stock.
- Credit return reduces customer outstanding balance.
- Cash refund creates a cashbook outflow.

Use a database transaction.
Return complete backend, frontend, validation, and tests.
```

## 11. Cashbook Prompt

```text
Build a basic cashbook and daily closing module.

Entry types:
- OPENING_CASH
- CASH_SALE
- CUSTOMER_RECOVERY
- SUPPLIER_PAYMENT
- EXPENSE
- CASH_DEPOSIT
- CASH_WITHDRAWAL
- OWNER_INVESTMENT
- OWNER_WITHDRAWAL
- OTHER_INCOME
- OTHER_EXPENSE
- CLOSING_ADJUSTMENT

Requirements:
- Opening cash
- Expected cash
- Actual cash
- Cash difference
- Daily closing
- Date filter
- User filter
- Reference transaction
- Audit fields

Create database models, services, API endpoints, cashbook page, closing form, report, and tests.
```

## 12. Reports Prompt

```text
Build the essential MVP reports.

Reports:
- Daily and date-range sales
- Product-wise and customer-wise sales
- Cash and credit sales
- Daily and supplier-wise purchases
- Current and low stock
- Batch and near-expiry stock
- Expired and damaged stock
- Customer and supplier ledger
- Receivables and payables
- Expenses
- Cashbook

Requirements:
- Date, customer, supplier, product, category, and payment filters
- Print
- PDF export
- CSV export
- Owner protection for sensitive reports

Create optimized queries, API endpoints, React report pages, and export helpers.
```

## 13. Dashboard Prompt

```text
Build a simple operational dashboard.

Show:
- Today invoice count
- Low-stock products
- Near-expiry products
- Expired products
- Damaged stock alerts
- Pending customer payments
- Pending supplier payments
- Recent sales
- Recent purchases
- Last backup status

Do not show:
- Profit
- Loss
- Cash in hand
- Net worth
- Detailed sales totals

Use compact cards and tables.
Do not create financial charts.
Support 1366x768 desktop screens.
```

## 14. Thermal Invoice Prompt

```text
Create a thermal invoice template for 80 mm paper.

Include:
- Shop logo and name
- Address and phone
- Invoice number
- Date and time
- Cashier and customer
- Item, quantity, unit, rate, discount, tax, and line total
- Subtotal, total discount, tax, grand total
- Paid and due amount
- Payment method
- Previous and current balance
- Thank-you message

Requirements:
- 80 mm print CSS
- No horizontal scrolling
- English and Urdu support
- Reprint watermark
- PDF version
```

## 15. Seed Data Prompt

```text
Create realistic seed data for a Pakistani cooking oil and ghee agency.

Include:
- Owner, Admin, and Cashier users
- 5 categories
- 8 fictional brands
- 25 products
- 500 ml, 1 L, 3 L, 5 L, 10 L, and 16 L sizes
- Carton and piece configurations
- Retail and wholesale prices
- 8 suppliers
- 15 customers
- Opening stock
- Sample batches and expiry dates
- Sample purchases, sales, and khata entries

Use fictional business names and Pakistani phone formats.
Do not use real CNIC or NTN numbers.
Return Prisma seed.ts.
```

## 16. Testing Prompt

```text
Act as a senior QA engineer.

Create a full test plan for:
- Authentication and permissions
- Product CRUD and barcode uniqueness
- Carton conversion
- Opening stock
- Purchase stock update
- Cash and credit purchase
- Cash, credit, and partial-payment sale
- Customer and supplier ledgers
- Negative stock block
- Expired batch block
- Sales return
- Damaged stock
- Cashbook
- Invoice printing
- Reports

Return unit, integration, and end-to-end test cases, edge cases, test data, expected results, and release blockers.
```

## 17. Full Implementation Prompt for Cursor or Windsurf

```text
Read IMPLEMENTATION.md completely before writing code.

Implement this project in small verified stages.

Rules:
- Do not skip database design.
- Do not use mock APIs after the real API is available.
- Do not duplicate business logic in frontend and backend.
- Put inventory calculations in one inventory service.
- Put ledger calculations in ledger services.
- Use database transactions for purchases, sales, returns, and payments.
- Use Zod for request validation.
- Use decimal-safe money fields.
- Block negative stock.
- Store stock in smallest units.
- Add audit fields.
- Add loading, empty, success, and error states.
- Write tests for all critical calculations.

Implementation order:
1. Project setup
2. Prisma schema
3. Seed data
4. Authentication
5. Products
6. Inventory
7. Suppliers
8. Purchases
9. Customers
10. POS
11. Khata and payments
12. Returns
13. Damage and expiry
14. Cashbook
15. Reports
16. Printing
17. QA
18. Build installer

At the end of each stage:
- Run typecheck
- Run lint
- Run tests
- Fix errors
- Show changed files
- Explain what is ready
- State the next stage

Do not continue while critical errors remain.
```

## 18. Bug Fix Prompt

```text
Act as a senior debugging engineer.

Context:
[PASTE MODULE OR WORKFLOW]

Expected behavior:
[PASTE EXPECTED RESULT]

Actual behavior:
[PASTE ACTUAL RESULT]

Error or logs:
[PASTE ERROR]

Relevant files:
[PASTE FILES]

Check:
- Data validation
- Database transaction
- Stock movement
- Ledger posting
- Money rounding
- Carton and piece conversion
- State management
- API error handling

Return root cause, exact fix, updated code, regression test, and related risks.
```

## 19. Release Review Prompt

```text
Act as a senior software release reviewer.

Review:
- Authentication and roles
- Product setup
- Carton and piece calculations
- Stock movement consistency
- Purchase and sales posting
- Customer khata
- Supplier ledger
- Payments
- Returns
- Damaged stock
- Cashbook
- Reports
- Thermal printing
- SQLite backup
- Installer
- Error handling
- Data recovery
- Audit logs

Classify findings as Release Blocker, High, Medium, or Low.

Return release readiness score, blocking issues, required fixes, pilot checklist, and rollback plan.
```
