-- CreateTable
CREATE TABLE "FineWaiver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleDeadline" TIMESTAMP(3),
    "meetingId" TEXT,
    "waivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FineWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FineWaiver_userId_idx" ON "FineWaiver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FineWaiver_userId_cycleDeadline_key" ON "FineWaiver"("userId", "cycleDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "FineWaiver_userId_meetingId_key" ON "FineWaiver"("userId", "meetingId");

-- AddForeignKey
ALTER TABLE "FineWaiver" ADD CONSTRAINT "FineWaiver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineWaiver" ADD CONSTRAINT "FineWaiver_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FineWaiver" ADD CONSTRAINT "FineWaiver_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
