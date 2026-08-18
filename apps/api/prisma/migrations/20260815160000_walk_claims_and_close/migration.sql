-- CreateEnum
CREATE TYPE "ClosedBy" AS ENUM ('WALKER', 'OWNER', 'ADMIN');

-- AlterTable
ALTER TABLE "Walk" ADD COLUMN     "endedLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "closedBy" "ClosedBy";
