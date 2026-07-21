CREATE TABLE `Account` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`normalBalance` text NOT NULL,
	`systemCode` text,
	`parentId` text,
	`allowManual` boolean DEFAULT false NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`isSystem` boolean DEFAULT false NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`parentId`) REFERENCES `Account`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `Account_parentId_idx` ON `Account` (`parentId`);--> statement-breakpoint
CREATE INDEX `Account_type_isActive_idx` ON `Account` (`type`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `Account_systemCode_key` ON `Account` (`systemCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `Account_code_key` ON `Account` (`code`);--> statement-breakpoint
CREATE TABLE `AuditLog` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text,
	`beforeJson` text,
	`afterJson` text,
	`ipAddress` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `AuditLog_userId_createdAt_idx` ON `AuditLog` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `AuditLog_entityType_entityId_createdAt_idx` ON `AuditLog` (`entityType`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `BackgroundJob` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`dedupeKey` text NOT NULL,
	`payloadJson` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 12 NOT NULL,
	`nextRunAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`lockedAt` datetime,
	`lastError` text,
	`completedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `BackgroundJob_type_status_createdAt_idx` ON `BackgroundJob` (`type`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `BackgroundJob_status_nextRunAt_createdAt_idx` ON `BackgroundJob` (`status`,`nextRunAt`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `BackgroundJob_dedupeKey_key` ON `BackgroundJob` (`dedupeKey`);--> statement-breakpoint
CREATE TABLE `BackupRecord` (
	`id` text PRIMARY KEY NOT NULL,
	`fileName` text NOT NULL,
	`localPath` text NOT NULL,
	`checksumSha256` text NOT NULL,
	`sizeBytes` integer NOT NULL,
	`kind` text NOT NULL,
	`driveFileId` text,
	`driveUploadedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `BackupRecord_driveUploadedAt_createdAt_idx` ON `BackupRecord` (`driveUploadedAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `BackupRecord_createdAt_idx` ON `BackupRecord` (`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `BackupRecord_driveFileId_key` ON `BackupRecord` (`driveFileId`);--> statement-breakpoint
CREATE UNIQUE INDEX `BackupRecord_fileName_key` ON `BackupRecord` (`fileName`);--> statement-breakpoint
CREATE TABLE `BankAccount` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`accountNumber` text,
	`bankName` text,
	`glAccountId` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`glAccountId`) REFERENCES `Account`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `BankAccount_isActive_name_idx` ON `BankAccount` (`isActive`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `BankAccount_glAccountId_key` ON `BankAccount` (`glAccountId`);--> statement-breakpoint
CREATE TABLE `Brand` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Brand_name_key` ON `Brand` (`name`);--> statement-breakpoint
CREATE TABLE `CashbookEntry` (
	`id` text PRIMARY KEY NOT NULL,
	`entryNumber` text NOT NULL,
	`direction` text NOT NULL,
	`entryType` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`paymentId` text,
	`salesReturnId` text,
	`expenseId` text,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`notes` text,
	`reference` text,
	`reversalOfId` text,
	`occurredAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`salesReturnId`) REFERENCES `SalesReturn`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`reversalOfId`) REFERENCES `CashbookEntry`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CashbookEntry_sourceType_sourceId_entryType_key` ON `CashbookEntry` (`sourceType`,`sourceId`,`entryType`);--> statement-breakpoint
CREATE INDEX `CashbookEntry_entryType_occurredAt_idx` ON `CashbookEntry` (`entryType`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `CashbookEntry_createdById_occurredAt_idx` ON `CashbookEntry` (`createdById`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `CashbookEntry_occurredAt_direction_idx` ON `CashbookEntry` (`occurredAt`,`direction`);--> statement-breakpoint
CREATE UNIQUE INDEX `CashbookEntry_reversalOfId_key` ON `CashbookEntry` (`reversalOfId`);--> statement-breakpoint
CREATE UNIQUE INDEX `CashbookEntry_entryNumber_key` ON `CashbookEntry` (`entryNumber`);--> statement-breakpoint
CREATE TABLE `Category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Category_name_key` ON `Category` (`name`);--> statement-breakpoint
CREATE TABLE `Customer` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`businessName` text,
	`phone` text,
	`whatsapp` text,
	`address` text,
	`taxIdentifier` text,
	`province` text,
	`fbrRegistrationType` text DEFAULT 'UNREGISTERED' NOT NULL,
	`customerType` text DEFAULT 'RETAILER' NOT NULL,
	`creditLimitMinor` integer DEFAULT 0 NOT NULL,
	`openingBalanceMinor` integer DEFAULT 0 NOT NULL,
	`paymentTermsDays` integer DEFAULT 0 NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `Customer_customerType_isActive_idx` ON `Customer` (`customerType`,`isActive`);--> statement-breakpoint
CREATE INDEX `Customer_businessName_idx` ON `Customer` (`businessName`);--> statement-breakpoint
CREATE INDEX `Customer_phone_idx` ON `Customer` (`phone`);--> statement-breakpoint
CREATE INDEX `Customer_name_idx` ON `Customer` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Customer_code_key` ON `Customer` (`code`);--> statement-breakpoint
CREATE TABLE `CustomerLedger` (
	`id` text PRIMARY KEY NOT NULL,
	`customerId` text NOT NULL,
	`entryType` text NOT NULL,
	`debitMinor` integer DEFAULT 0 NOT NULL,
	`creditMinor` integer DEFAULT 0 NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`saleId` text,
	`paymentId` text,
	`salesReturnId` text,
	`notes` text,
	`dueDate` datetime,
	`reversalOfEntryId` text,
	`createdById` text,
	`occurredAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`salesReturnId`) REFERENCES `SalesReturn`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`reversalOfEntryId`) REFERENCES `CustomerLedger`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CustomerLedger_sourceType_sourceId_entryType_key` ON `CustomerLedger` (`sourceType`,`sourceId`,`entryType`);--> statement-breakpoint
CREATE INDEX `CustomerLedger_customerId_occurredAt_idx` ON `CustomerLedger` (`customerId`,`occurredAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `CustomerLedger_reversalOfEntryId_key` ON `CustomerLedger` (`reversalOfEntryId`);--> statement-breakpoint
CREATE TABLE `DailyClosing` (
	`id` text PRIMARY KEY NOT NULL,
	`businessDate` datetime NOT NULL,
	`openingCashMinor` integer NOT NULL,
	`cashInMinor` integer NOT NULL,
	`cashOutMinor` integer NOT NULL,
	`expectedCashMinor` integer NOT NULL,
	`countedCashMinor` integer NOT NULL,
	`differenceMinor` integer NOT NULL,
	`notes` text,
	`closedById` text NOT NULL,
	`closedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`closedById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `DailyClosing_closedById_closedAt_idx` ON `DailyClosing` (`closedById`,`closedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `DailyClosing_businessDate_key` ON `DailyClosing` (`businessDate`);--> statement-breakpoint
CREATE TABLE `DamageEntry` (
	`id` text PRIMARY KEY NOT NULL,
	`entryNumber` text NOT NULL,
	`type` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`quantityBase` integer NOT NULL,
	`costMinor` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`occurredAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `DamageEntry_batchId_occurredAt_idx` ON `DamageEntry` (`batchId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `DamageEntry_productId_occurredAt_idx` ON `DamageEntry` (`productId`,`occurredAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `DamageEntry_entryNumber_key` ON `DamageEntry` (`entryNumber`);--> statement-breakpoint
CREATE TABLE `DiscountApproval` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`requestedById` text NOT NULL,
	`approvedById` text NOT NULL,
	`discountBps` integer NOT NULL,
	`expiresAt` datetime NOT NULL,
	`usedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `DiscountApproval_requestedById_expiresAt_idx` ON `DiscountApproval` (`requestedById`,`expiresAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `DiscountApproval_tokenHash_key` ON `DiscountApproval` (`tokenHash`);--> statement-breakpoint
CREATE TABLE `Expense` (
	`id` text PRIMARY KEY NOT NULL,
	`voucherNumber` text NOT NULL,
	`category` text NOT NULL,
	`categoryId` text,
	`description` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`method` text NOT NULL,
	`bankAccountId` text,
	`reference` text,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`incurredAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`voidedAt` datetime,
	`voidedById` text,
	`voidReason` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `Expense_bankAccountId_incurredAt_idx` ON `Expense` (`bankAccountId`,`incurredAt`);--> statement-breakpoint
CREATE INDEX `Expense_createdById_incurredAt_idx` ON `Expense` (`createdById`,`incurredAt`);--> statement-breakpoint
CREATE INDEX `Expense_categoryId_incurredAt_idx` ON `Expense` (`categoryId`,`incurredAt`);--> statement-breakpoint
CREATE INDEX `Expense_incurredAt_status_idx` ON `Expense` (`incurredAt`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `Expense_voucherNumber_key` ON `Expense` (`voucherNumber`);--> statement-breakpoint
CREATE TABLE `ExpenseCategory` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`accountId` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ExpenseCategory_isActive_name_idx` ON `ExpenseCategory` (`isActive`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ExpenseCategory_name_key` ON `ExpenseCategory` (`name`);--> statement-breakpoint
CREATE TABLE `FinancialPeriod` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`startDate` datetime NOT NULL,
	`endDate` datetime NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`closedAt` datetime,
	`closedById` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `FinancialPeriod_startDate_endDate_key` ON `FinancialPeriod` (`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `FinancialPeriod_status_startDate_endDate_idx` ON `FinancialPeriod` (`status`,`startDate`,`endDate`);--> statement-breakpoint
CREATE UNIQUE INDEX `FinancialPeriod_name_key` ON `FinancialPeriod` (`name`);--> statement-breakpoint
CREATE TABLE `FinancialTransaction` (
	`id` text PRIMARY KEY NOT NULL,
	`transactionNumber` text NOT NULL,
	`type` text NOT NULL,
	`amountMinor` integer NOT NULL,
	`fromBankAccountId` text,
	`toBankAccountId` text,
	`offsetAccountId` text,
	`description` text NOT NULL,
	`reference` text,
	`occurredAt` datetime NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fromBankAccountId`) REFERENCES `BankAccount`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`toBankAccountId`) REFERENCES `BankAccount`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `FinancialTransaction_type_occurredAt_idx` ON `FinancialTransaction` (`type`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `FinancialTransaction_occurredAt_status_idx` ON `FinancialTransaction` (`occurredAt`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `FinancialTransaction_transactionNumber_key` ON `FinancialTransaction` (`transactionNumber`);--> statement-breakpoint
CREATE TABLE `HeldSale` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`cartJson` text NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `HeldSale_createdById_updatedAt_idx` ON `HeldSale` (`createdById`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `JournalEntry` (
	`id` text PRIMARY KEY NOT NULL,
	`entryNumber` text NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`postingKey` text DEFAULT 'PRIMARY' NOT NULL,
	`transactionDate` datetime NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`totalDebitMinor` integer NOT NULL,
	`totalCreditMinor` integer NOT NULL,
	`periodId` text NOT NULL,
	`reversalOfId` text,
	`reversalReason` text,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`periodId`) REFERENCES `FinancialPeriod`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`reversalOfId`) REFERENCES `JournalEntry`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `JournalEntry_sourceType_sourceId_postingKey_key` ON `JournalEntry` (`sourceType`,`sourceId`,`postingKey`);--> statement-breakpoint
CREATE INDEX `JournalEntry_periodId_status_idx` ON `JournalEntry` (`periodId`,`status`);--> statement-breakpoint
CREATE INDEX `JournalEntry_transactionDate_status_idx` ON `JournalEntry` (`transactionDate`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `JournalEntry_reversalOfId_key` ON `JournalEntry` (`reversalOfId`);--> statement-breakpoint
CREATE UNIQUE INDEX `JournalEntry_entryNumber_key` ON `JournalEntry` (`entryNumber`);--> statement-breakpoint
CREATE TABLE `JournalLine` (
	`id` text PRIMARY KEY NOT NULL,
	`journalId` text NOT NULL,
	`lineNumber` integer NOT NULL,
	`accountId` text NOT NULL,
	`debitMinor` integer DEFAULT 0 NOT NULL,
	`creditMinor` integer DEFAULT 0 NOT NULL,
	`customerId` text,
	`supplierId` text,
	`productId` text,
	`memo` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`journalId`) REFERENCES `JournalEntry`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `JournalLine_journalId_lineNumber_key` ON `JournalLine` (`journalId`,`lineNumber`);--> statement-breakpoint
CREATE INDEX `JournalLine_productId_journalId_idx` ON `JournalLine` (`productId`,`journalId`);--> statement-breakpoint
CREATE INDEX `JournalLine_supplierId_journalId_idx` ON `JournalLine` (`supplierId`,`journalId`);--> statement-breakpoint
CREATE INDEX `JournalLine_customerId_journalId_idx` ON `JournalLine` (`customerId`,`journalId`);--> statement-breakpoint
CREATE INDEX `JournalLine_accountId_journalId_idx` ON `JournalLine` (`accountId`,`journalId`);--> statement-breakpoint
CREATE TABLE `LoginHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text,
	`username` text NOT NULL,
	`success` boolean NOT NULL,
	`reason` text,
	`ipAddress` text,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `LoginHistory_username_createdAt_idx` ON `LoginHistory` (`username`,`createdAt`);--> statement-breakpoint
CREATE TABLE `Payment` (
	`id` text PRIMARY KEY NOT NULL,
	`receiptNumber` text NOT NULL,
	`direction` text NOT NULL,
	`partyType` text NOT NULL,
	`customerId` text,
	`supplierId` text,
	`saleId` text,
	`purchaseId` text,
	`method` text NOT NULL,
	`bankAccountId` text,
	`amountMinor` integer NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`reversalOfId` text,
	`reference` text,
	`notes` text,
	`paidAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`reversalOfId`) REFERENCES `Payment`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `Payment_bankAccountId_paidAt_idx` ON `Payment` (`bankAccountId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `Payment_purchaseId_idx` ON `Payment` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `Payment_saleId_idx` ON `Payment` (`saleId`);--> statement-breakpoint
CREATE INDEX `Payment_supplierId_paidAt_idx` ON `Payment` (`supplierId`,`paidAt`);--> statement-breakpoint
CREATE INDEX `Payment_customerId_paidAt_idx` ON `Payment` (`customerId`,`paidAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `Payment_reversalOfId_key` ON `Payment` (`reversalOfId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Payment_receiptNumber_key` ON `Payment` (`receiptNumber`);--> statement-breakpoint
CREATE TABLE `Permission` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Permission_code_key` ON `Permission` (`code`);--> statement-breakpoint
CREATE TABLE `Product` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`categoryId` text,
	`brandId` text,
	`baseUnitId` text NOT NULL,
	`productType` text DEFAULT 'OIL' NOT NULL,
	`sizeValue` real,
	`sizeUnit` text,
	`purchasePriceMinor` integer DEFAULT 0 NOT NULL,
	`averageCostMinor` integer DEFAULT 0 NOT NULL,
	`inventoryValueMinor` integer DEFAULT 0 NOT NULL,
	`retailPriceMinor` integer DEFAULT 0 NOT NULL,
	`wholesalePriceMinor` integer DEFAULT 0 NOT NULL,
	`minimumPriceMinor` integer DEFAULT 0 NOT NULL,
	`taxRateBps` integer DEFAULT 0 NOT NULL,
	`fbrHsCode` text,
	`fbrUom` text DEFAULT 'Numbers, pieces, units' NOT NULL,
	`fbrSaleType` text DEFAULT 'Goods at standard rate (default)' NOT NULL,
	`fbrFixedNotifiedValueMinor` integer DEFAULT 0 NOT NULL,
	`fbrSroScheduleNo` text,
	`fbrSroItemSerialNo` text,
	`reorderLevelBaseQty` integer DEFAULT 0 NOT NULL,
	`stockOnHandBaseQty` integer DEFAULT 0 NOT NULL,
	`rackLocation` text,
	`notes` text,
	`trackBatch` boolean DEFAULT true NOT NULL,
	`trackExpiry` boolean DEFAULT true NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`baseUnitId`) REFERENCES `Unit`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `Product_categoryId_brandId_isActive_idx` ON `Product` (`categoryId`,`brandId`,`isActive`);--> statement-breakpoint
CREATE INDEX `Product_name_idx` ON `Product` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Product_barcode_key` ON `Product` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `Product_sku_key` ON `Product` (`sku`);--> statement-breakpoint
CREATE TABLE `ProductBatch` (
	`id` text PRIMARY KEY NOT NULL,
	`productId` text NOT NULL,
	`batchNumber` text NOT NULL,
	`manufactureDate` datetime,
	`expiryDate` datetime,
	`purchasePriceMinor` integer NOT NULL,
	`stockOnHandBaseQty` integer DEFAULT 0 NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ProductBatch_productId_batchNumber_key` ON `ProductBatch` (`productId`,`batchNumber`);--> statement-breakpoint
CREATE INDEX `ProductBatch_expiryDate_stockOnHandBaseQty_idx` ON `ProductBatch` (`expiryDate`,`stockOnHandBaseQty`);--> statement-breakpoint
CREATE TABLE `ProductPacking` (
	`id` text PRIMARY KEY NOT NULL,
	`productId` text NOT NULL,
	`unitId` text NOT NULL,
	`name` text NOT NULL,
	`unitsPerPack` integer NOT NULL,
	`barcode` text,
	`isPurchaseUnit` boolean DEFAULT false NOT NULL,
	`isSaleUnit` boolean DEFAULT false NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ProductPacking_productId_name_key` ON `ProductPacking` (`productId`,`name`);--> statement-breakpoint
CREATE INDEX `ProductPacking_productId_isActive_idx` ON `ProductPacking` (`productId`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `ProductPacking_barcode_key` ON `ProductPacking` (`barcode`);--> statement-breakpoint
CREATE TABLE `Purchase` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceNumber` text NOT NULL,
	`supplierInvoice` text,
	`supplierInvoiceNormalized` text,
	`supplierId` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`paymentStatus` text NOT NULL,
	`subtotalMinor` integer NOT NULL,
	`discountMinor` integer DEFAULT 0 NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`transportMinor` integer DEFAULT 0 NOT NULL,
	`loadingMinor` integer DEFAULT 0 NOT NULL,
	`otherExpenseMinor` integer DEFAULT 0 NOT NULL,
	`totalMinor` integer NOT NULL,
	`paidMinor` integer DEFAULT 0 NOT NULL,
	`dueDate` datetime,
	`notes` text,
	`purchasedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_supplierId_supplierInvoice_key` ON `Purchase` (`supplierId`,`supplierInvoice`);--> statement-breakpoint
CREATE INDEX `Purchase_purchasedAt_status_idx` ON `Purchase` (`purchasedAt`,`status`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_purchasedAt_idx` ON `Purchase` (`supplierId`,`purchasedAt`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_supplierInvoiceNormalized_idx` ON `Purchase` (`supplierId`,`supplierInvoiceNormalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_invoiceNumber_key` ON `Purchase` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `PurchaseItem` (
	`id` text PRIMARY KEY NOT NULL,
	`purchaseId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`packingName` text NOT NULL,
	`unitsPerPack` integer NOT NULL,
	`packQuantity` integer NOT NULL,
	`baseQuantity` integer DEFAULT 0 NOT NULL,
	`quantityBase` integer NOT NULL,
	`purchaseRateMinor` integer DEFAULT 0 NOT NULL,
	`unitCostMinor` integer NOT NULL,
	`discountMinor` integer DEFAULT 0 NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`lineTotalMinor` integer NOT NULL,
	FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `PurchaseItem_productId_batchId_idx` ON `PurchaseItem` (`productId`,`batchId`);--> statement-breakpoint
CREATE INDEX `PurchaseItem_purchaseId_idx` ON `PurchaseItem` (`purchaseId`);--> statement-breakpoint
CREATE TABLE `PurchaseReturn` (
	`id` text PRIMARY KEY NOT NULL,
	`returnNumber` text NOT NULL,
	`purchaseId` text NOT NULL,
	`supplierId` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`method` text NOT NULL,
	`subtotalMinor` integer NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`totalMinor` integer NOT NULL,
	`reason` text NOT NULL,
	`returnedAt` datetime NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `PurchaseReturn_supplierId_returnedAt_idx` ON `PurchaseReturn` (`supplierId`,`returnedAt`);--> statement-breakpoint
CREATE INDEX `PurchaseReturn_purchaseId_returnedAt_idx` ON `PurchaseReturn` (`purchaseId`,`returnedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `PurchaseReturn_returnNumber_key` ON `PurchaseReturn` (`returnNumber`);--> statement-breakpoint
CREATE TABLE `PurchaseReturnItem` (
	`id` text PRIMARY KEY NOT NULL,
	`purchaseReturnId` text NOT NULL,
	`purchaseItemId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`quantityBase` integer NOT NULL,
	`unitCostMinor` integer NOT NULL,
	`lineTotalMinor` integer NOT NULL,
	FOREIGN KEY (`purchaseReturnId`) REFERENCES `PurchaseReturn`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`purchaseItemId`) REFERENCES `PurchaseItem`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `PurchaseReturnItem_productId_batchId_idx` ON `PurchaseReturnItem` (`productId`,`batchId`);--> statement-breakpoint
CREATE INDEX `PurchaseReturnItem_purchaseItemId_idx` ON `PurchaseReturnItem` (`purchaseItemId`);--> statement-breakpoint
CREATE TABLE `Role` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`isSystem` boolean DEFAULT false NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Role_code_key` ON `Role` (`code`);--> statement-breakpoint
CREATE TABLE `RolePermission` (
	`roleId` text NOT NULL,
	`permissionId` text NOT NULL,
	PRIMARY KEY(`roleId`, `permissionId`),
	FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Sale` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceNumber` text NOT NULL,
	`customerId` text,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`paymentStatus` text NOT NULL,
	`saleType` text DEFAULT 'RETAIL' NOT NULL,
	`subtotalMinor` integer NOT NULL,
	`discountMinor` integer DEFAULT 0 NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`totalMinor` integer NOT NULL,
	`paidMinor` integer DEFAULT 0 NOT NULL,
	`previousBalanceMinor` integer DEFAULT 0 NOT NULL,
	`currentBalanceMinor` integer DEFAULT 0 NOT NULL,
	`dueDate` datetime,
	`notes` text,
	`fbrStatus` text DEFAULT 'PENDING' NOT NULL,
	`fbrInvoiceNumber` text,
	`fbrScenarioId` text,
	`fbrPayloadJson` text,
	`fbrResponseJson` text,
	`fbrError` text,
	`fbrSubmittedAt` datetime,
	`soldAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`fbrPayloadHash` text,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `Sale_fbrStatus_soldAt_idx` ON `Sale` (`fbrStatus`,`soldAt`);--> statement-breakpoint
CREATE INDEX `Sale_soldAt_status_idx` ON `Sale` (`soldAt`,`status`);--> statement-breakpoint
CREATE INDEX `Sale_customerId_soldAt_idx` ON `Sale` (`customerId`,`soldAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `Sale_fbrInvoiceNumber_key` ON `Sale` (`fbrInvoiceNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `Sale_invoiceNumber_key` ON `Sale` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `SaleItem` (
	`id` text PRIMARY KEY NOT NULL,
	`saleId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`packingName` text NOT NULL,
	`unitsPerPack` integer NOT NULL,
	`packQuantity` integer NOT NULL,
	`baseQuantity` integer DEFAULT 0 NOT NULL,
	`quantityBase` integer NOT NULL,
	`unitPriceMinor` integer NOT NULL,
	`costPriceMinor` integer NOT NULL,
	`discountMinor` integer DEFAULT 0 NOT NULL,
	`taxMinor` integer DEFAULT 0 NOT NULL,
	`taxRateBps` integer DEFAULT 0 NOT NULL,
	`fbrHsCode` text,
	`fbrUom` text,
	`fbrSaleType` text,
	`fbrFixedNotifiedValueMinor` integer DEFAULT 0 NOT NULL,
	`fbrSroScheduleNo` text,
	`fbrSroItemSerialNo` text,
	`lineTotalMinor` integer NOT NULL,
	FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `SaleItem_productId_batchId_idx` ON `SaleItem` (`productId`,`batchId`);--> statement-breakpoint
CREATE INDEX `SaleItem_saleId_idx` ON `SaleItem` (`saleId`);--> statement-breakpoint
CREATE TABLE `SalesReturn` (
	`id` text PRIMARY KEY NOT NULL,
	`returnNumber` text NOT NULL,
	`saleId` text NOT NULL,
	`customerId` text,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`refundMethod` text NOT NULL,
	`totalMinor` integer NOT NULL,
	`returnTotalMinor` integer NOT NULL,
	`replacementTotalMinor` integer DEFAULT 0 NOT NULL,
	`refundMinor` integer NOT NULL,
	`reason` text NOT NULL,
	`returnedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `SalesReturn_saleId_returnedAt_idx` ON `SalesReturn` (`saleId`,`returnedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `SalesReturn_returnNumber_key` ON `SalesReturn` (`returnNumber`);--> statement-breakpoint
CREATE TABLE `SalesReturnItem` (
	`id` text PRIMARY KEY NOT NULL,
	`salesReturnId` text NOT NULL,
	`saleItemId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`quantityBase` integer NOT NULL,
	`unitPriceMinor` integer NOT NULL,
	`lineTotalMinor` integer NOT NULL,
	`condition` text NOT NULL,
	FOREIGN KEY (`salesReturnId`) REFERENCES `SalesReturn`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`saleItemId`) REFERENCES `SaleItem`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `SalesReturnItem_saleItemId_idx` ON `SalesReturnItem` (`saleItemId`);--> statement-breakpoint
CREATE TABLE `SalesReturnReplacementItem` (
	`id` text PRIMARY KEY NOT NULL,
	`salesReturnId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`packingName` text NOT NULL,
	`unitsPerPack` integer NOT NULL,
	`quantityBase` integer NOT NULL,
	`unitPriceMinor` integer NOT NULL,
	`lineTotalMinor` integer NOT NULL,
	FOREIGN KEY (`salesReturnId`) REFERENCES `SalesReturn`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `SalesReturnReplacementItem_productId_batchId_idx` ON `SalesReturnReplacementItem` (`productId`,`batchId`);--> statement-breakpoint
CREATE INDEX `SalesReturnReplacementItem_salesReturnId_idx` ON `SalesReturnReplacementItem` (`salesReturnId`);--> statement-breakpoint
CREATE TABLE `Session` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` datetime NOT NULL,
	`revokedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Session_userId_expiresAt_idx` ON `Session` (`userId`,`expiresAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `Session_tokenHash_key` ON `Session` (`tokenHash`);--> statement-breakpoint
CREATE TABLE `Setting` (
	`key` text PRIMARY KEY NOT NULL,
	`valueJson` text NOT NULL,
	`isSecret` boolean DEFAULT false NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `StockCount` (
	`id` text PRIMARY KEY NOT NULL,
	`countNumber` text NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`notes` text,
	`countedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `StockCount_createdById_countedAt_idx` ON `StockCount` (`createdById`,`countedAt`);--> statement-breakpoint
CREATE INDEX `StockCount_countedAt_status_idx` ON `StockCount` (`countedAt`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `StockCount_countNumber_key` ON `StockCount` (`countNumber`);--> statement-breakpoint
CREATE TABLE `StockCountItem` (
	`id` text PRIMARY KEY NOT NULL,
	`stockCountId` text NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`expectedBaseQty` integer NOT NULL,
	`countedBaseQty` integer NOT NULL,
	`varianceBaseQty` integer NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`stockCountId`) REFERENCES `StockCount`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `StockCountItem_stockCountId_productId_batchId_key` ON `StockCountItem` (`stockCountId`,`productId`,`batchId`);--> statement-breakpoint
CREATE INDEX `StockCountItem_batchId_createdAt_idx` ON `StockCountItem` (`batchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `StockCountItem_productId_createdAt_idx` ON `StockCountItem` (`productId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `StockMovement` (
	`id` text PRIMARY KEY NOT NULL,
	`productId` text NOT NULL,
	`batchId` text,
	`movementType` text NOT NULL,
	`quantityBase` integer NOT NULL,
	`balanceAfterBase` integer NOT NULL,
	`batchBalanceAfterBase` integer,
	`unitCostMinor` integer DEFAULT 0 NOT NULL,
	`valueMinor` integer DEFAULT 0 NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`sourceLineId` text NOT NULL,
	`notes` text,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`batchId`) REFERENCES `ProductBatch`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `StockMovement_sourceType_sourceId_sourceLineId_key` ON `StockMovement` (`sourceType`,`sourceId`,`sourceLineId`);--> statement-breakpoint
CREATE INDEX `StockMovement_sourceType_sourceId_idx` ON `StockMovement` (`sourceType`,`sourceId`);--> statement-breakpoint
CREATE INDEX `StockMovement_batchId_createdAt_idx` ON `StockMovement` (`batchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `StockMovement_productId_createdAt_idx` ON `StockMovement` (`productId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `Supplier` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`businessName` text,
	`phone` text,
	`whatsapp` text,
	`address` text,
	`taxIdentifier` text,
	`openingBalanceMinor` integer DEFAULT 0 NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `Supplier_businessName_idx` ON `Supplier` (`businessName`);--> statement-breakpoint
CREATE INDEX `Supplier_phone_idx` ON `Supplier` (`phone`);--> statement-breakpoint
CREATE INDEX `Supplier_name_idx` ON `Supplier` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Supplier_code_key` ON `Supplier` (`code`);--> statement-breakpoint
CREATE TABLE `SupplierLedger` (
	`id` text PRIMARY KEY NOT NULL,
	`supplierId` text NOT NULL,
	`entryType` text NOT NULL,
	`debitMinor` integer DEFAULT 0 NOT NULL,
	`creditMinor` integer DEFAULT 0 NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` text NOT NULL,
	`purchaseId` text,
	`paymentId` text,
	`notes` text,
	`dueDate` datetime,
	`reversalOfEntryId` text,
	`createdById` text,
	`occurredAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`reversalOfEntryId`) REFERENCES `SupplierLedger`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `SupplierLedger_sourceType_sourceId_entryType_key` ON `SupplierLedger` (`sourceType`,`sourceId`,`entryType`);--> statement-breakpoint
CREATE INDEX `SupplierLedger_supplierId_occurredAt_idx` ON `SupplierLedger` (`supplierId`,`occurredAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `SupplierLedger_reversalOfEntryId_key` ON `SupplierLedger` (`reversalOfEntryId`);--> statement-breakpoint
CREATE TABLE `Unit` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Unit_symbol_key` ON `Unit` (`symbol`);--> statement-breakpoint
CREATE UNIQUE INDEX `Unit_name_key` ON `Unit` (`name`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`displayName` text NOT NULL,
	`passwordHash` text NOT NULL,
	`ownerPinHash` text,
	`roleId` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`cashierDiscountLimitBps` integer DEFAULT 0 NOT NULL,
	`failedLoginAttempts` integer DEFAULT 0 NOT NULL,
	`lockedUntil` datetime,
	`lastLoginAt` datetime,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `User_roleId_isActive_idx` ON `User` (`roleId`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_username_key` ON `User` (`username`);
