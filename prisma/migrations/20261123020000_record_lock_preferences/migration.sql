ALTER TABLE "MedicalRecord" ADD COLUMN "proposeMedicalLock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lockExpectedRestDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "lockUnlockConditions" TEXT;
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_rest_days_valid" CHECK ("lockExpectedRestDays" BETWEEN 1 AND 180);
