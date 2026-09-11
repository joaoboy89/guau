-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('PERSONAL', 'DOCUMENT', 'SID', 'DIDIT');

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "WalkerProfile" ADD COLUMN     "verificationMethod" "VerificationMethod",
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;
