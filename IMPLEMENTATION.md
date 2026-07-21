# Cooking Oil & Ghee Agency Software — 4-Day AI-Assisted MVP

## 1. Product Summary

This project is a desktop-first agency management system for a single-location cooking oil and ghee business.

The first version focuses on:

- Fast product and inventory management
- Carton and piece stock handling
- Cash and credit purchases
- Cash and credit sales
- Customer and supplier khata
- Batch and expiry tracking
- Damaged and expired stock
- Basic cashbook
- Thermal and PDF invoice printing
- Essential operational reports

The MVP must remain simple enough for an owner, cashier, or accountant to use without training.

## 2. MVP Goal

Build a usable pilot version in four development days using AI-assisted coding.

The MVP should support one agency, one computer, one local database, and one business owner.

The MVP is successful when the user can:

1. Login
2. Add products
3. Configure carton and piece conversion
4. Add suppliers and customers
5. Record a purchase
6. Receive stock
7. Create a cash or credit sale
8. Update customer or supplier ledger
9. Print an invoice
10. Record a return or damaged stock
11. Review stock, khata, cashbook, and sales reports

## 3. Scope

### Included

- Secure login
- Owner, Admin, and Cashier roles
- Basic role permissions
- Product CRUD
- Category, brand, unit, barcode, and pricing
- Carton-to-piece conversion
- Opening stock
- Stock movement ledger
- Supplier CRUD
- Customer CRUD
- Purchase entry
- Sale entry
- Cash and credit transactions
- Partial payment
- Customer khata
- Supplier ledger
- Basic batch and expiry tracking
- Sales return
- Damaged and expired stock entry
- Basic cashbook
- Daily closing
- Thermal invoice
- PDF invoice
- Basic reports
- Local backup
- Seed data
- Audit fields

### Excluded from the 4-Day MVP

- Full FBR integration
- Cloud synchronization
- Multi-branch support
- Full accounting
- Trial balance
- Balance sheet
- Financial year closing
- Advanced profitability
- Complex approval workflows
- Mobile application
- Customer ordering portal
- Route salesman management
- Advanced promotional pricing
- Advanced purchase return workflow
- Insurance claims

## 4. Recommended Technology Stack

### Desktop Application

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zustand
- React Hook Form
- Zod

### Backend and Local Data

- Node.js
- Express
- SQLite
- Drizzle ORM

### Utilities

- ESC/POS-compatible printing
- PDF generation
- Electron Builder
- Vitest or Jest
- Playwright for end-to-end testing

## 5. Suggested Project Structure

```text
oil-ghee-agency/
├── apps/
│   ├── desktop/
│   │   ├── electron/
│   │   └── src/
│   │       ├── components/
│   │       ├── features/
│   │       ├── layouts/
│   │       ├── pages/
│   │       ├── routes/
│   │       ├── stores/
│   │       └── utils/
│   └── api/
│       └── src/
│           ├── modules/
│           ├── middleware/
│           ├── services/
│           ├── database/
│           └── utils/
├── packages/
│   ├── shared/
│   ├── ui/
│   └── config/
├── drizzle/
│   └── migrations
├── apps/api/src/db/
│   └── schema.ts
├── docs/
│   ├── IMPLEMENTATION.md
│   └── AI_PROMPTS.md
├── package.json
└── README.md
```

## 6. User Roles

### Owner

- Full access
- Manage users
- Manage pricing
- View sensitive reports
- Approve discounts
- Manage settings
- View audit logs

### Admin

- Manage products
- Manage purchases
- Manage suppliers
- Manage customers
- Manage stock
- View most reports
- Cannot change protected owner settings unless allowed

### Cashier

- Create sales
- Search products
- Select customers
- Receive payments
- Print invoices
- Request discount approval
- Cannot view profit, loss, cash in hand, or sensitive reports
- Cannot change product pricing

## 7. Core Business Rules

### Inventory Storage

Always store stock in the smallest configured unit.

```text
1 carton = 12 bottles
2 cartons + 5 bottles = 29 bottles
```

The UI may display carton and piece quantities, but the database stores the smallest-unit quantity.

### Stock Movement

Never directly change stock without creating a stock movement record.

Supported movement types:

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
- TRANSFER_IN
- TRANSFER_OUT

### Negative Stock

Do not allow stock to become negative.

### Credit Sale

A credit sale must:

- Create a sale
- Deduct stock
- Create a customer ledger debit
- Update outstanding balance

### Customer Payment

A customer payment must:

- Create a payment record
- Create a customer ledger credit
- Reduce outstanding balance

### Supplier Purchase

A credit purchase must:

- Create a purchase
- Increase stock
- Create a supplier ledger credit
- Increase supplier payable balance

### Supplier Payment

A supplier payment must:

- Create a payment record
- Create a supplier ledger debit
- Reduce payable balance

### Return Handling

A sales return must:

- Reference the original sale
- Return selected quantity
- Update stock based on condition
- Adjust customer balance or refund cash
- Add audit history

## 8. Core Database Entities

### User

```text
id
name
username
passwordHash
role
isActive
failedLoginAttempts
lockedUntil
createdAt
updatedAt
```

### Product

```text
id
name
brandId
categoryId
sku
barcode
productType
sizeValue
sizeUnit
baseUnit
purchaseUnit
saleUnit
unitsPerPack
purchasePrice
retailPrice
wholesalePrice
minimumPrice
taxRate
reorderLevel
location
isActive
createdAt
updatedAt
```

### ProductBatch

```text
id
productId
batchNumber
manufacturingDate
expiryDate
purchasePrice
availableQtyBase
createdAt
updatedAt
```

### StockMovement

```text
id
productId
batchId
type
quantityBase
referenceType
referenceId
reason
userId
createdAt
```

### Customer

```text
id
name
businessName
phone
whatsapp
address
cnicNtn
customerType
openingBalance
creditLimit
paymentTermsDays
isActive
createdAt
updatedAt
```

### Supplier

```text
id
name
businessName
phone
whatsapp
address
cnicNtn
openingBalance
creditLimit
paymentTermsDays
isActive
createdAt
updatedAt
```

### Sale and SaleItem

```text
Sale:
id, invoiceNumber, customerId, saleType, subtotal, discount, tax,
grandTotal, paidAmount, dueAmount, paymentStatus, status, cashierId, createdAt

SaleItem:
id, saleId, productId, batchId, quantityBase, displayUnit,
displayQuantity, unitPrice, discount, tax, lineTotal
```

### Purchase and PurchaseItem

```text
Purchase:
id, invoiceNumber, supplierInvoiceNumber, supplierId, purchaseDate,
dueDate, subtotal, discount, tax, transportExpense, loadingExpense,
otherExpense, grandTotal, paidAmount, dueAmount, paymentStatus, createdBy, createdAt

PurchaseItem:
id, purchaseId, productId, batchId, quantityBase, displayUnit,
displayQuantity, purchaseRate, lineTotal
```

### Ledgers and Payments

```text
CustomerLedger:
id, customerId, type, amount, referenceType, referenceId,
description, createdBy, createdAt

SupplierLedger:
id, supplierId, type, amount, referenceType, referenceId,
description, createdBy, createdAt

Payment:
id, partyType, partyId, direction, amount, method, referenceNumber,
referenceType, referenceId, status, createdBy, createdAt
```

### Other Entities

- SalesReturn
- SalesReturnItem
- DamageEntry
- Expense
- CashbookEntry
- Setting
- AuditLog

## 9. Main Screens

### Authentication

- Login
- Locked account message
- Logout

### Dashboard

Show:

- Today invoice count
- Low-stock count
- Near-expiry count
- Expired count
- Pending customer balances
- Pending supplier balances
- Recent sales
- Recent purchases
- Backup status

Do not show:

- Profit
- Loss
- Cash in hand
- Business net worth
- Detailed sales amount

### Products

- Product list
- Add product
- Edit product
- Packing configuration
- Barcode generation
- Opening stock
- Active/inactive status

### Inventory

- Current stock
- Carton and piece display
- Stock movement
- Stock adjustment
- Damaged stock
- Expired stock
- Physical stock count

### Suppliers and Purchases

- Supplier list and form
- Supplier ledger
- Supplier payment
- Purchase list
- New purchase
- Purchase details
- Purchase payment

### Customers and Khata

- Customer list and form
- Customer ledger
- Payment received
- Credit limit warning
- Due and overdue balances

### POS

- Barcode search
- Product search
- Cart
- Carton/piece selector
- Retail/wholesale price
- Customer selector
- Cash/credit/partial payment
- Discount approval
- Print invoice

### Returns

- Original invoice search
- Return items
- Quantity
- Condition
- Refund or ledger adjustment

### Cashbook

- Opening cash
- Cash inflows
- Cash outflows
- Expenses
- Closing cash
- Difference

### Reports

- Daily sales
- Purchases
- Current stock
- Low stock
- Expiry
- Customer ledger
- Supplier ledger
- Expenses
- Cashbook

## 10. API Modules

```text
/auth
/users
/products
/categories
/brands
/units
/inventory
/batches
/suppliers
/purchases
/customers
/sales
/payments
/returns
/damage
/cashbook
/reports
/settings
/audit
```

## 11. Required API Endpoints

```http
POST /auth/login
POST /auth/logout
GET  /auth/me

GET    /products
POST   /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id

GET  /inventory
GET  /inventory/:productId/movements
POST /inventory/opening-stock
POST /inventory/adjustment
POST /inventory/convert-pack

GET  /purchases
POST /purchases
GET  /purchases/:id
POST /purchases/:id/payment

GET  /sales
POST /sales
GET  /sales/:id
POST /sales/:id/return

GET  /customers
POST /customers
GET  /customers/:id/ledger
POST /customers/:id/payment

GET  /suppliers
POST /suppliers
GET  /suppliers/:id/ledger
POST /suppliers/:id/payment

GET /reports/daily-sales
GET /reports/purchases
GET /reports/current-stock
GET /reports/low-stock
GET /reports/expiry
GET /reports/customer-ledger
GET /reports/supplier-ledger
GET /reports/cashbook
```

## 12. Four-Day Development Plan

### Day 1 — Foundation

- Set up Electron, React, TypeScript, Tailwind, and SQLite
- Create database schema
- Create authentication
- Create roles
- Build navigation
- Build product CRUD
- Add categories, brands, units, barcode, and opening stock
- Add seed data

### Day 2 — Inventory and Purchases

- Implement base-unit stock storage
- Implement carton and piece conversion
- Implement stock movement ledger
- Create suppliers
- Create purchases
- Update stock from purchases
- Add batch and expiry fields
- Add low-stock and expired-stock checks

### Day 3 — POS and Khata

- Build POS screen
- Add barcode and product search
- Add carton and piece sales
- Add cash and credit sale
- Add partial payments
- Add customers
- Add customer ledger
- Add supplier ledger
- Add discount approval PIN
- Add invoice printing

### Day 4 — Returns, Cashbook, Reports, QA

- Add sales return
- Add damaged and expired stock entry
- Add expenses
- Add cashbook
- Add daily closing
- Add essential reports
- Add dashboard alerts
- Run end-to-end testing
- Fix blocking bugs
- Create demo build and installer

## 13. Testing Checklist

### Product and Inventory

- Add, edit, and deactivate product
- Add opening stock
- Configure carton conversion
- Convert carton to piece
- Block negative stock
- Verify low-stock warning

### Purchases

- Cash purchase
- Credit purchase
- Partial-payment purchase
- Purchase updates stock
- Supplier balance updates
- Batch and expiry are saved

### Sales

- Cash sale
- Credit sale
- Partial payment sale
- Carton sale
- Piece sale
- Retail and wholesale price
- Discount approval
- Stock deduction
- Invoice printing

### Khata

- Customer opening balance
- Credit sale ledger debit
- Customer payment ledger credit
- Supplier purchase ledger credit
- Supplier payment ledger debit
- Current balance calculation

### Returns

- Full and partial sales return
- Resalable stock
- Damaged stock
- Customer balance adjustment
- Cash refund

### Cashbook

- Opening cash
- Cash sale
- Customer recovery
- Supplier payment
- Expense
- Closing cash
- Cash difference

## 14. Definition of Done

The MVP is complete when:

- All critical workflows work without manual database changes
- Stock quantities remain correct
- Customer and supplier balances remain correct
- Cash and credit transactions post correctly
- Sales return updates stock and ledger
- Invoice printing works
- Reports show correct totals
- Owner and Cashier permissions work
- No blocking errors occur during the pilot workflow
- A Windows installer or runnable desktop build is available

## 15. Post-MVP Roadmap

### Week 2

- Purchase returns
- Better invoice templates
- Advanced payment methods
- Better permissions
- Bug fixes
- Customer-specific prices
- Supplier claims
- WhatsApp invoice sharing

### Week 3

- Cloud backup
- Manual and automatic sync
- Advanced reports
- Profit reports
- Product-wise margins
- Better audit logs

### Later Paid Version

- FBR integration
- Multi-branch
- Full accounting
- Balance sheet
- Trial balance
- Financial year closing
- Mobile dashboard
- Customer ordering portal
