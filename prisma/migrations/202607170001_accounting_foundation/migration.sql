PRAGMA foreign_keys=OFF;

ALTER TABLE "Product" ADD COLUMN "averageCostMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "inventoryValueMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockMovement" ADD COLUMN "unitCostMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockMovement" ADD COLUMN "valueMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "Payment" ADD COLUMN "reversalOfId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN "accountId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "DamageEntry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "CashbookEntry" ADD COLUMN "reversalOfId" TEXT;

CREATE TABLE "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "normalBalance" TEXT NOT NULL,
  "systemCode" TEXT,
  "parentId" TEXT,
  "allowManual" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE UNIQUE INDEX "Account_systemCode_key" ON "Account"("systemCode");
CREATE INDEX "Account_type_isActive_idx" ON "Account"("type", "isActive");
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

CREATE TABLE "FinancialPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" DATETIME,
  "closedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "FinancialPeriod_name_key" ON "FinancialPeriod"("name");
CREATE UNIQUE INDEX "FinancialPeriod_startDate_endDate_key" ON "FinancialPeriod"("startDate", "endDate");
CREATE INDEX "FinancialPeriod_status_startDate_endDate_idx" ON "FinancialPeriod"("status", "startDate", "endDate");

CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entryNumber" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "postingKey" TEXT NOT NULL DEFAULT 'PRIMARY',
  "transactionDate" DATETIME NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "totalDebitMinor" INTEGER NOT NULL,
  "totalCreditMinor" INTEGER NOT NULL,
  "periodId" TEXT NOT NULL,
  "reversalOfId" TEXT,
  "reversalReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancialPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_postingKey_key" ON "JournalEntry"("sourceType", "sourceId", "postingKey");
CREATE INDEX "JournalEntry_transactionDate_status_idx" ON "JournalEntry"("transactionDate", "status");
CREATE INDEX "JournalEntry_periodId_status_idx" ON "JournalEntry"("periodId", "status");

CREATE TABLE "JournalLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journalId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "debitMinor" INTEGER NOT NULL DEFAULT 0,
  "creditMinor" INTEGER NOT NULL DEFAULT 0,
  "customerId" TEXT,
  "supplierId" TEXT,
  "productId" TEXT,
  "memo" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "JournalLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JournalLine_journalId_lineNumber_key" ON "JournalLine"("journalId", "lineNumber");
CREATE INDEX "JournalLine_accountId_journalId_idx" ON "JournalLine"("accountId", "journalId");
CREATE INDEX "JournalLine_customerId_journalId_idx" ON "JournalLine"("customerId", "journalId");
CREATE INDEX "JournalLine_supplierId_journalId_idx" ON "JournalLine"("supplierId", "journalId");
CREATE INDEX "JournalLine_productId_journalId_idx" ON "JournalLine"("productId", "journalId");

CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "accountNumber" TEXT,
  "bankName" TEXT,
  "glAccountId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BankAccount_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankAccount_glAccountId_key" ON "BankAccount"("glAccountId");
CREATE INDEX "BankAccount_isActive_name_idx" ON "BankAccount"("isActive", "name");

CREATE TABLE "FinancialTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionNumber" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "fromBankAccountId" TEXT,
  "toBankAccountId" TEXT,
  "offsetAccountId" TEXT,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialTransaction_fromBankAccountId_fkey" FOREIGN KEY ("fromBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialTransaction_toBankAccountId_fkey" FOREIGN KEY ("toBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialTransaction_transactionNumber_key" ON "FinancialTransaction"("transactionNumber");
CREATE INDEX "FinancialTransaction_occurredAt_status_idx" ON "FinancialTransaction"("occurredAt", "status");
CREATE INDEX "FinancialTransaction_type_occurredAt_idx" ON "FinancialTransaction"("type", "occurredAt");

CREATE TABLE "PurchaseReturn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "returnNumber" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "method" TEXT NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "returnedAt" DATETIME NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReturn_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseReturn_returnNumber_key" ON "PurchaseReturn"("returnNumber");
CREATE INDEX "PurchaseReturn_purchaseId_returnedAt_idx" ON "PurchaseReturn"("purchaseId", "returnedAt");
CREATE INDEX "PurchaseReturn_supplierId_returnedAt_idx" ON "PurchaseReturn"("supplierId", "returnedAt");

CREATE TABLE "PurchaseReturnItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseReturnId" TEXT NOT NULL,
  "purchaseItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchId" TEXT,
  "quantityBase" INTEGER NOT NULL,
  "unitCostMinor" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  CONSTRAINT "PurchaseReturnItem_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseReturnItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PurchaseReturnItem_purchaseItemId_idx" ON "PurchaseReturnItem"("purchaseItemId");
CREATE INDEX "PurchaseReturnItem_productId_batchId_idx" ON "PurchaseReturnItem"("productId", "batchId");

CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");
CREATE INDEX "Payment_bankAccountId_paidAt_idx" ON "Payment"("bankAccountId", "paidAt");
CREATE INDEX "Expense_bankAccountId_incurredAt_idx" ON "Expense"("bankAccountId", "incurredAt");
CREATE UNIQUE INDEX "CashbookEntry_reversalOfId_key" ON "CashbookEntry"("reversalOfId");

UPDATE "Product"
SET "averageCostMinor" = "purchasePriceMinor",
    "inventoryValueMinor" = "stockOnHandBaseQty" * "purchasePriceMinor"
WHERE "stockOnHandBaseQty" > 0;

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
