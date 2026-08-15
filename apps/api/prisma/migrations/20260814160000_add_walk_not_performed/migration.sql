-- AlterEnum
ALTER TYPE "WalkStatus" ADD VALUE 'NOT_PERFORMED';

-- CreateEnum
CREATE TYPE "NotPerformedReason" AS ENUM ('WALKER_NO_SHOW', 'OWNER_NO_SHOW', 'NOBODY_ACTED', 'NEVER_CONFIRMED');

-- AlterTable
ALTER TABLE "Walk" ADD COLUMN     "notPerformedReason" "NotPerformedReason",
ADD COLUMN     "notPerformedAt" TIMESTAMP(3);
