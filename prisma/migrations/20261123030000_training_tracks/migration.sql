CREATE TABLE "TrainingTrack" (
  "id" TEXT PRIMARY KEY,"code" TEXT NOT NULL UNIQUE,"name" TEXT NOT NULL,"surface" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 6 CHECK ("capacity" BETWEEN 1 AND 6),
  "isActive" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingTrack_surface_valid" CHECK ("surface" IN ('TURF','DIRT','SYNTHETIC'))
);
ALTER TABLE "WorkoutSession" ADD COLUMN "trackId" TEXT;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "WorkoutSession_trackId_scheduledDate_idx" ON "WorkoutSession"("trackId","scheduledDate");
