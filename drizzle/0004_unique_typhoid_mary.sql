PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_Account` (
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
INSERT INTO `__new_Account`("id", "code", "name", "type", "normalBalance", "systemCode", "parentId", "allowManual", "isActive", "isSystem", "deletedAt", "createdAt", "updatedAt") SELECT "id", "code", "name", "type", "normalBalance", "systemCode", "parentId", "allowManual", "isActive", "isSystem", "deletedAt", "createdAt", "updatedAt" FROM `Account`;--> statement-breakpoint
DROP TABLE `Account`;--> statement-breakpoint
ALTER TABLE `__new_Account` RENAME TO `Account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `Account_parentId_idx` ON `Account` (`parentId`);--> statement-breakpoint
CREATE INDEX `Account_type_isActive_idx` ON `Account` (`type`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `Account_systemCode_key` ON `Account` (`systemCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `Account_code_key` ON `Account` (`code`);--> statement-breakpoint
CREATE TABLE `__new_BackgroundJob` (
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
INSERT INTO `__new_BackgroundJob`("id", "type", "status", "dedupeKey", "payloadJson", "attempts", "maxAttempts", "nextRunAt", "lockedAt", "lastError", "completedAt", "createdAt", "updatedAt") SELECT "id", "type", "status", "dedupeKey", "payloadJson", "attempts", "maxAttempts", "nextRunAt", "lockedAt", "lastError", "completedAt", "createdAt", "updatedAt" FROM `BackgroundJob`;--> statement-breakpoint
DROP TABLE `BackgroundJob`;--> statement-breakpoint
ALTER TABLE `__new_BackgroundJob` RENAME TO `BackgroundJob`;--> statement-breakpoint
CREATE INDEX `BackgroundJob_type_status_createdAt_idx` ON `BackgroundJob` (`type`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `BackgroundJob_status_nextRunAt_createdAt_idx` ON `BackgroundJob` (`status`,`nextRunAt`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `BackgroundJob_dedupeKey_key` ON `BackgroundJob` (`dedupeKey`);--> statement-breakpoint
CREATE TABLE `__new_BankAccount` (
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
INSERT INTO `__new_BankAccount`("id", "name", "accountNumber", "bankName", "glAccountId", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "name", "accountNumber", "bankName", "glAccountId", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `BankAccount`;--> statement-breakpoint
DROP TABLE `BankAccount`;--> statement-breakpoint
ALTER TABLE `__new_BankAccount` RENAME TO `BankAccount`;--> statement-breakpoint
CREATE INDEX `BankAccount_isActive_name_idx` ON `BankAccount` (`isActive`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `BankAccount_glAccountId_key` ON `BankAccount` (`glAccountId`);--> statement-breakpoint
CREATE TABLE `__new_Brand` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_Brand`("id", "name", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "name", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Brand`;--> statement-breakpoint
DROP TABLE `Brand`;--> statement-breakpoint
ALTER TABLE `__new_Brand` RENAME TO `Brand`;--> statement-breakpoint
CREATE UNIQUE INDEX `Brand_name_key` ON `Brand` (`name`);--> statement-breakpoint
CREATE TABLE `__new_Category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_Category`("id", "name", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "name", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Category`;--> statement-breakpoint
DROP TABLE `Category`;--> statement-breakpoint
ALTER TABLE `__new_Category` RENAME TO `Category`;--> statement-breakpoint
CREATE UNIQUE INDEX `Category_name_key` ON `Category` (`name`);--> statement-breakpoint
CREATE TABLE `__new_Customer` (
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
INSERT INTO `__new_Customer`("id", "code", "name", "businessName", "phone", "whatsapp", "address", "taxIdentifier", "province", "fbrRegistrationType", "customerType", "creditLimitMinor", "openingBalanceMinor", "paymentTermsDays", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "code", "name", "businessName", "phone", "whatsapp", "address", "taxIdentifier", "province", "fbrRegistrationType", "customerType", "creditLimitMinor", "openingBalanceMinor", "paymentTermsDays", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Customer`;--> statement-breakpoint
DROP TABLE `Customer`;--> statement-breakpoint
ALTER TABLE `__new_Customer` RENAME TO `Customer`;--> statement-breakpoint
CREATE INDEX `Customer_customerType_isActive_idx` ON `Customer` (`customerType`,`isActive`);--> statement-breakpoint
CREATE INDEX `Customer_businessName_idx` ON `Customer` (`businessName`);--> statement-breakpoint
CREATE INDEX `Customer_phone_idx` ON `Customer` (`phone`);--> statement-breakpoint
CREATE INDEX `Customer_name_idx` ON `Customer` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Customer_code_key` ON `Customer` (`code`);--> statement-breakpoint
CREATE TABLE `__new_ExpenseCategory` (
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
INSERT INTO `__new_ExpenseCategory`("id", "name", "isActive", "deletedAt", "accountId", "createdAt", "updatedAt") SELECT "id", "name", "isActive", "deletedAt", "accountId", "createdAt", "updatedAt" FROM `ExpenseCategory`;--> statement-breakpoint
DROP TABLE `ExpenseCategory`;--> statement-breakpoint
ALTER TABLE `__new_ExpenseCategory` RENAME TO `ExpenseCategory`;--> statement-breakpoint
CREATE INDEX `ExpenseCategory_isActive_name_idx` ON `ExpenseCategory` (`isActive`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ExpenseCategory_name_key` ON `ExpenseCategory` (`name`);--> statement-breakpoint
CREATE TABLE `__new_FinancialPeriod` (
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
INSERT INTO `__new_FinancialPeriod`("id", "name", "startDate", "endDate", "status", "closedAt", "closedById", "createdAt", "updatedAt") SELECT "id", "name", "startDate", "endDate", "status", "closedAt", "closedById", "createdAt", "updatedAt" FROM `FinancialPeriod`;--> statement-breakpoint
DROP TABLE `FinancialPeriod`;--> statement-breakpoint
ALTER TABLE `__new_FinancialPeriod` RENAME TO `FinancialPeriod`;--> statement-breakpoint
CREATE UNIQUE INDEX `FinancialPeriod_startDate_endDate_key` ON `FinancialPeriod` (`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `FinancialPeriod_status_startDate_endDate_idx` ON `FinancialPeriod` (`status`,`startDate`,`endDate`);--> statement-breakpoint
CREATE UNIQUE INDEX `FinancialPeriod_name_key` ON `FinancialPeriod` (`name`);--> statement-breakpoint
CREATE TABLE `__new_HeldSale` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`cartJson` text NOT NULL,
	`createdById` text NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_HeldSale`("id", "label", "cartJson", "createdById", "createdAt", "updatedAt") SELECT "id", "label", "cartJson", "createdById", "createdAt", "updatedAt" FROM `HeldSale`;--> statement-breakpoint
DROP TABLE `HeldSale`;--> statement-breakpoint
ALTER TABLE `__new_HeldSale` RENAME TO `HeldSale`;--> statement-breakpoint
CREATE INDEX `HeldSale_createdById_updatedAt_idx` ON `HeldSale` (`createdById`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `__new_Product` (
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
INSERT INTO `__new_Product`("id", "name", "sku", "barcode", "categoryId", "brandId", "baseUnitId", "productType", "sizeValue", "sizeUnit", "purchasePriceMinor", "averageCostMinor", "inventoryValueMinor", "retailPriceMinor", "wholesalePriceMinor", "minimumPriceMinor", "taxRateBps", "fbrHsCode", "fbrUom", "fbrSaleType", "fbrFixedNotifiedValueMinor", "fbrSroScheduleNo", "fbrSroItemSerialNo", "reorderLevelBaseQty", "stockOnHandBaseQty", "rackLocation", "notes", "trackBatch", "trackExpiry", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "name", "sku", "barcode", "categoryId", "brandId", "baseUnitId", "productType", "sizeValue", "sizeUnit", "purchasePriceMinor", "averageCostMinor", "inventoryValueMinor", "retailPriceMinor", "wholesalePriceMinor", "minimumPriceMinor", "taxRateBps", "fbrHsCode", "fbrUom", "fbrSaleType", "fbrFixedNotifiedValueMinor", "fbrSroScheduleNo", "fbrSroItemSerialNo", "reorderLevelBaseQty", "stockOnHandBaseQty", "rackLocation", "notes", "trackBatch", "trackExpiry", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Product`;--> statement-breakpoint
DROP TABLE `Product`;--> statement-breakpoint
ALTER TABLE `__new_Product` RENAME TO `Product`;--> statement-breakpoint
CREATE INDEX `Product_categoryId_brandId_isActive_idx` ON `Product` (`categoryId`,`brandId`,`isActive`);--> statement-breakpoint
CREATE INDEX `Product_name_idx` ON `Product` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Product_barcode_key` ON `Product` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `Product_sku_key` ON `Product` (`sku`);--> statement-breakpoint
CREATE TABLE `__new_ProductBatch` (
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
INSERT INTO `__new_ProductBatch`("id", "productId", "batchNumber", "manufactureDate", "expiryDate", "purchasePriceMinor", "stockOnHandBaseQty", "createdAt", "updatedAt") SELECT "id", "productId", "batchNumber", "manufactureDate", "expiryDate", "purchasePriceMinor", "stockOnHandBaseQty", "createdAt", "updatedAt" FROM `ProductBatch`;--> statement-breakpoint
DROP TABLE `ProductBatch`;--> statement-breakpoint
ALTER TABLE `__new_ProductBatch` RENAME TO `ProductBatch`;--> statement-breakpoint
CREATE UNIQUE INDEX `ProductBatch_productId_batchNumber_key` ON `ProductBatch` (`productId`,`batchNumber`);--> statement-breakpoint
CREATE INDEX `ProductBatch_expiryDate_stockOnHandBaseQty_idx` ON `ProductBatch` (`expiryDate`,`stockOnHandBaseQty`);--> statement-breakpoint
CREATE TABLE `__new_Purchase` (
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
INSERT INTO `__new_Purchase`("id", "invoiceNumber", "supplierInvoice", "supplierInvoiceNormalized", "supplierId", "status", "paymentStatus", "subtotalMinor", "discountMinor", "taxMinor", "transportMinor", "loadingMinor", "otherExpenseMinor", "totalMinor", "paidMinor", "dueDate", "notes", "purchasedAt", "createdById", "createdAt", "updatedAt") SELECT "id", "invoiceNumber", "supplierInvoice", "supplierInvoiceNormalized", "supplierId", "status", "paymentStatus", "subtotalMinor", "discountMinor", "taxMinor", "transportMinor", "loadingMinor", "otherExpenseMinor", "totalMinor", "paidMinor", "dueDate", "notes", "purchasedAt", "createdById", "createdAt", "updatedAt" FROM `Purchase`;--> statement-breakpoint
DROP TABLE `Purchase`;--> statement-breakpoint
ALTER TABLE `__new_Purchase` RENAME TO `Purchase`;--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_supplierId_supplierInvoice_key` ON `Purchase` (`supplierId`,`supplierInvoice`);--> statement-breakpoint
CREATE INDEX `Purchase_purchasedAt_status_idx` ON `Purchase` (`purchasedAt`,`status`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_purchasedAt_idx` ON `Purchase` (`supplierId`,`purchasedAt`);--> statement-breakpoint
CREATE INDEX `Purchase_supplierId_supplierInvoiceNormalized_idx` ON `Purchase` (`supplierId`,`supplierInvoiceNormalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `Purchase_invoiceNumber_key` ON `Purchase` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `__new_Role` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`isSystem` boolean DEFAULT false NOT NULL,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_Role`("id", "code", "name", "isSystem", "createdAt", "updatedAt") SELECT "id", "code", "name", "isSystem", "createdAt", "updatedAt" FROM `Role`;--> statement-breakpoint
DROP TABLE `Role`;--> statement-breakpoint
ALTER TABLE `__new_Role` RENAME TO `Role`;--> statement-breakpoint
CREATE UNIQUE INDEX `Role_code_key` ON `Role` (`code`);--> statement-breakpoint
CREATE TABLE `__new_Sale` (
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
	`fbrRequestJson` text,
	`fbrResponseJson` text,
	`fbrQrData` text,
	`fbrError` text,
	`fbrRetryCount` integer DEFAULT 0 NOT NULL,
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
INSERT INTO `__new_Sale`("id", "invoiceNumber", "customerId", "status", "paymentStatus", "saleType", "subtotalMinor", "discountMinor", "taxMinor", "totalMinor", "paidMinor", "previousBalanceMinor", "currentBalanceMinor", "dueDate", "notes", "fbrStatus", "fbrInvoiceNumber", "fbrScenarioId", "fbrPayloadJson", "fbrRequestJson", "fbrResponseJson", "fbrQrData", "fbrError", "fbrRetryCount", "fbrSubmittedAt", "soldAt", "createdById", "createdAt", "updatedAt", "fbrPayloadHash") SELECT "id", "invoiceNumber", "customerId", "status", "paymentStatus", "saleType", "subtotalMinor", "discountMinor", "taxMinor", "totalMinor", "paidMinor", "previousBalanceMinor", "currentBalanceMinor", "dueDate", "notes", "fbrStatus", "fbrInvoiceNumber", "fbrScenarioId", "fbrPayloadJson", "fbrRequestJson", "fbrResponseJson", "fbrQrData", "fbrError", "fbrRetryCount", "fbrSubmittedAt", "soldAt", "createdById", "createdAt", "updatedAt", "fbrPayloadHash" FROM `Sale`;--> statement-breakpoint
DROP TABLE `Sale`;--> statement-breakpoint
ALTER TABLE `__new_Sale` RENAME TO `Sale`;--> statement-breakpoint
CREATE INDEX `Sale_fbrStatus_soldAt_idx` ON `Sale` (`fbrStatus`,`soldAt`);--> statement-breakpoint
CREATE INDEX `Sale_soldAt_status_idx` ON `Sale` (`soldAt`,`status`);--> statement-breakpoint
CREATE INDEX `Sale_customerId_soldAt_idx` ON `Sale` (`customerId`,`soldAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `Sale_fbrInvoiceNumber_key` ON `Sale` (`fbrInvoiceNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `Sale_invoiceNumber_key` ON `Sale` (`invoiceNumber`);--> statement-breakpoint
CREATE TABLE `__new_Setting` (
	`key` text PRIMARY KEY NOT NULL,
	`valueJson` text NOT NULL,
	`isSecret` boolean DEFAULT false NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_Setting`("key", "valueJson", "isSecret", "updatedAt") SELECT "key", "valueJson", "isSecret", "updatedAt" FROM `Setting`;--> statement-breakpoint
DROP TABLE `Setting`;--> statement-breakpoint
ALTER TABLE `__new_Setting` RENAME TO `Setting`;--> statement-breakpoint
CREATE TABLE `__new_Supplier` (
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
INSERT INTO `__new_Supplier`("id", "code", "name", "businessName", "phone", "whatsapp", "address", "taxIdentifier", "openingBalanceMinor", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "code", "name", "businessName", "phone", "whatsapp", "address", "taxIdentifier", "openingBalanceMinor", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Supplier`;--> statement-breakpoint
DROP TABLE `Supplier`;--> statement-breakpoint
ALTER TABLE `__new_Supplier` RENAME TO `Supplier`;--> statement-breakpoint
CREATE INDEX `Supplier_businessName_idx` ON `Supplier` (`businessName`);--> statement-breakpoint
CREATE INDEX `Supplier_phone_idx` ON `Supplier` (`phone`);--> statement-breakpoint
CREATE INDEX `Supplier_name_idx` ON `Supplier` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Supplier_code_key` ON `Supplier` (`code`);--> statement-breakpoint
CREATE TABLE `__new_Unit` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`isActive` boolean DEFAULT true NOT NULL,
	`deletedAt` datetime,
	`createdAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` datetime DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_Unit`("id", "name", "symbol", "isActive", "deletedAt", "createdAt", "updatedAt") SELECT "id", "name", "symbol", "isActive", "deletedAt", "createdAt", "updatedAt" FROM `Unit`;--> statement-breakpoint
DROP TABLE `Unit`;--> statement-breakpoint
ALTER TABLE `__new_Unit` RENAME TO `Unit`;--> statement-breakpoint
CREATE UNIQUE INDEX `Unit_symbol_key` ON `Unit` (`symbol`);--> statement-breakpoint
CREATE UNIQUE INDEX `Unit_name_key` ON `Unit` (`name`);--> statement-breakpoint
CREATE TABLE `__new_User` (
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
INSERT INTO `__new_User`("id", "username", "displayName", "passwordHash", "ownerPinHash", "roleId", "isActive", "cashierDiscountLimitBps", "failedLoginAttempts", "lockedUntil", "lastLoginAt", "deletedAt", "createdAt", "updatedAt") SELECT "id", "username", "displayName", "passwordHash", "ownerPinHash", "roleId", "isActive", "cashierDiscountLimitBps", "failedLoginAttempts", "lockedUntil", "lastLoginAt", "deletedAt", "createdAt", "updatedAt" FROM `User`;--> statement-breakpoint
DROP TABLE `User`;--> statement-breakpoint
ALTER TABLE `__new_User` RENAME TO `User`;--> statement-breakpoint
CREATE INDEX `User_roleId_isActive_idx` ON `User` (`roleId`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `User_username_key` ON `User` (`username`);