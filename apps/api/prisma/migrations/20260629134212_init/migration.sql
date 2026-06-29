-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'WALKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WalkStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WALKER_ON_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_OWNER', 'CANCELLED_WALKER');

-- CreateEnum
CREATE TYPE "WalkMode" AS ENUM ('GRUPAL', 'EXCLUSIVO');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT,
    "neighborhood" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "OwnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "dniNumber" TEXT,
    "dniPhotoUrl" TEXT,
    "selfieUrl" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNotes" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "maxDogsPerWalk" INTEGER NOT NULL DEFAULT 6,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION,
    "mpAccessToken" TEXT,
    "mpUserId" TEXT,

    CONSTRAINT "WalkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkerSchedule" (
    "id" TEXT NOT NULL,
    "walkerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WalkerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT,
    "size" TEXT NOT NULL,
    "ageYears" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkType" (
    "id" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "exclusiveMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WalkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Walk" (
    "id" TEXT NOT NULL,
    "walkTypeId" TEXT NOT NULL,
    "walkerId" TEXT NOT NULL,
    "mode" "WalkMode" NOT NULL DEFAULT 'GRUPAL',
    "status" "WalkStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "walkerAmount" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL,
    "mpPaymentId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Walk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkParticipant" (
    "id" TEXT NOT NULL,
    "walkId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalkLocation" (
    "id" TEXT NOT NULL,
    "walkId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "walkId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "walkId" TEXT,
    "ownerId" TEXT NOT NULL,
    "walkerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "containsContactInfo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "walkerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "mpTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerProfile_userId_key" ON "OwnerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalkerProfile_userId_key" ON "WalkerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalkParticipant_walkId_dogId_key" ON "WalkParticipant"("walkId", "dogId");

-- CreateIndex
CREATE INDEX "WalkLocation_walkId_recordedAt_idx" ON "WalkLocation"("walkId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_walkId_reviewerId_key" ON "Review"("walkId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_walkId_key" ON "Conversation"("walkId");

-- AddForeignKey
ALTER TABLE "OwnerProfile" ADD CONSTRAINT "OwnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkerProfile" ADD CONSTRAINT "WalkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkerSchedule" ADD CONSTRAINT "WalkerSchedule_walkerId_fkey" FOREIGN KEY ("walkerId") REFERENCES "WalkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dog" ADD CONSTRAINT "Dog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Walk" ADD CONSTRAINT "Walk_walkTypeId_fkey" FOREIGN KEY ("walkTypeId") REFERENCES "WalkType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Walk" ADD CONSTRAINT "Walk_walkerId_fkey" FOREIGN KEY ("walkerId") REFERENCES "WalkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkParticipant" ADD CONSTRAINT "WalkParticipant_walkId_fkey" FOREIGN KEY ("walkId") REFERENCES "Walk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkParticipant" ADD CONSTRAINT "WalkParticipant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkParticipant" ADD CONSTRAINT "WalkParticipant_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalkLocation" ADD CONSTRAINT "WalkLocation_walkId_fkey" FOREIGN KEY ("walkId") REFERENCES "Walk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_walkId_fkey" FOREIGN KEY ("walkId") REFERENCES "Walk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_walkId_fkey" FOREIGN KEY ("walkId") REFERENCES "Walk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_walkerId_fkey" FOREIGN KEY ("walkerId") REFERENCES "WalkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_walkerId_fkey" FOREIGN KEY ("walkerId") REFERENCES "WalkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
