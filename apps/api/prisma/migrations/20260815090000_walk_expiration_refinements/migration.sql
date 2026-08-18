-- AlterEnum
ALTER TYPE "NotPerformedReason" ADD VALUE 'ON_WAY_NEVER_STARTED';

-- AlterTable
ALTER TABLE "Walk" ADD COLUMN     "startedLate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Walk_status_scheduledAt_idx" ON "Walk"("status", "scheduledAt");
