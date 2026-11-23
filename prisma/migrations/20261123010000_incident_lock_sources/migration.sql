ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'MERGED_INTO_TREATMENT';
CREATE TYPE "MedicalLockSource" AS ENUM ('VET', 'INCIDENT_AUTO');
ALTER TABLE "IncidentReport" ADD COLUMN "parentIncidentId" TEXT, ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "MedicalLock" ADD COLUMN "source" "MedicalLockSource" NOT NULL DEFAULT 'VET',
  ADD COLUMN "sourceIncidentId" TEXT, ADD COLUMN "issuedByUserId" TEXT,
  ALTER COLUMN "veterinarianUserId" DROP NOT NULL;
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_parentIncidentId_fkey"
  FOREIGN KEY ("parentIncidentId") REFERENCES "IncidentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalLock" ADD CONSTRAINT "MedicalLock_sourceIncidentId_fkey"
  FOREIGN KEY ("sourceIncidentId") REFERENCES "IncidentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicalLock" ADD CONSTRAINT "MedicalLock_source_valid" CHECK (
  ("source" = 'VET' AND "veterinarianUserId" IS NOT NULL) OR
  ("source" = 'INCIDENT_AUTO' AND "sourceIncidentId" IS NOT NULL AND "issuedByUserId" IS NOT NULL)
);
CREATE UNIQUE INDEX "MedicalLock_sourceIncidentId_key" ON "MedicalLock"("sourceIncidentId");
CREATE INDEX "IncidentReport_parentIncidentId_idx" ON "IncidentReport"("parentIncidentId");
