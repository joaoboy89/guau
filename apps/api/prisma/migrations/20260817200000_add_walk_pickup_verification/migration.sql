-- CreateEnum
CREATE TYPE "StartVerification" AS ENUM ('CODE', 'NONE');

-- AlterTable
ALTER TABLE "Walk" ADD COLUMN     "pickupCode" TEXT,
ADD COLUMN     "pickupCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startVerification" "StartVerification",
ADD COLUMN     "startVerifyReason" TEXT;
