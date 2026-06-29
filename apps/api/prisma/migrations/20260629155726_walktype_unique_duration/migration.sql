/*
  Warnings:

  - A unique constraint covering the columns `[durationMinutes]` on the table `WalkType` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "WalkType_durationMinutes_key" ON "WalkType"("durationMinutes");
