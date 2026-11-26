CREATE TYPE "CareCostEntryType" AS ENUM ('CONSUMPTION', 'REVERSAL', 'EXAM');

CREATE TABLE "CareCostEntry" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "medicalRecordId" TEXT,
    "prescriptionId" TEXT,
    "sourceTaskId" TEXT,
    "completionVersion" INTEGER,
    "supplyId" TEXT,
    "stockZoneId" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "prescribedAt" TIMESTAMP(3),
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "entryType" "CareCostEntryType" NOT NULL,
    "reversesEntryId" TEXT,
    "actorId" TEXT NOT NULL,
    "supplyName" TEXT NOT NULL,
    "recordNumber" TEXT,
    "veterinarianName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareCostEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareCostEntry_operationKey_key" ON "CareCostEntry"("operationKey");

CREATE UNIQUE INDEX "CareCostEntry_reversesEntryId_key" ON "CareCostEntry"("reversesEntryId");

CREATE INDEX "CareCostEntry_horseId_performedAt_idx" ON "CareCostEntry"("horseId", "performedAt");

CREATE INDEX "CareCostEntry_sourceTaskId_completionVersion_idx" ON "CareCostEntry"("sourceTaskId", "completionVersion");

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "DailyCareTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "SupplyCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "CareCostEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CareCostEntry" ADD CONSTRAINT "CareCostEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyCareTask" ADD COLUMN "completionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StockBalance" ALTER COLUMN "quantity" TYPE DECIMAL(18,6);

CREATE FUNCTION reject_care_cost_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CareCostEntry is append-only; append a reversal instead'; END $$;

CREATE TRIGGER care_cost_append_only BEFORE UPDATE OR DELETE ON "CareCostEntry" FOR EACH ROW EXECUTE FUNCTION reject_care_cost_mutation();
