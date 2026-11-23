CREATE TYPE "InvoiceBillingMethod" AS ENUM ('LEGACY_PACKAGE', 'ACTUAL_USAGE');

CREATE TABLE "CareBillingPolicy" (
    "id" TEXT NOT NULL DEFAULT 'club',
    "cutoverPeriod" TEXT,
    "examUnitPrice" DECIMAL(18,2),
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareBillingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareCostClaim" (
    "careCostEntryId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "CareCostClaim_pkey" PRIMARY KEY ("careCostEntryId")
);

CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "careCostEntryId" TEXT NOT NULL,
    "entryType" "CareCostEntryType" NOT NULL,
    "recordNumber" TEXT,
    "medicalRecordId" TEXT,
    "prescribedAt" TIMESTAMP(3),
    "performedAt" TIMESTAMP(3) NOT NULL,
    "veterinarianName" TEXT,
    "supplyName" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareCostClaim_invoiceId_idx" ON "CareCostClaim"("invoiceId");

CREATE UNIQUE INDEX "InvoiceLineItem_invoiceId_careCostEntryId_key" ON "InvoiceLineItem"("invoiceId", "careCostEntryId");

ALTER TABLE "CareCostClaim" ADD CONSTRAINT "CareCostClaim_careCostEntryId_fkey" FOREIGN KEY ("careCostEntryId") REFERENCES "CareCostEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostClaim" ADD CONSTRAINT "CareCostClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_careCostEntryId_fkey" FOREIGN KEY ("careCostEntryId") REFERENCES "CareCostEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialInvoice" ADD COLUMN "billingMethod" "InvoiceBillingMethod" NOT NULL DEFAULT 'LEGACY_PACKAGE';

ALTER TABLE "FinancialInvoice" ALTER COLUMN "boardingFee" TYPE DECIMAL(18,2);

ALTER TABLE "FinancialInvoice" ALTER COLUMN "boardingMonthlyRate" TYPE DECIMAL(18,2);

ALTER TABLE "FinancialInvoice" ALTER COLUMN "medicalFee" TYPE DECIMAL(18,2);

ALTER TABLE "FinancialInvoice" ALTER COLUMN "trainingFee" TYPE DECIMAL(18,2);

ALTER TABLE "FinancialInvoice" ALTER COLUMN "prizeCredit" TYPE DECIMAL(18,2);

ALTER TABLE "FinancialInvoice" ALTER COLUMN "netAmount" TYPE DECIMAL(18,2);

CREATE TRIGGER invoice_lines_append_only BEFORE UPDATE OR DELETE ON "InvoiceLineItem" FOR EACH ROW EXECUTE FUNCTION reject_care_cost_mutation();
