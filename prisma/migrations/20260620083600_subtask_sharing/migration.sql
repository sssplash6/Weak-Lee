-- CreateTable
CREATE TABLE "SubtaskShare" (
    "id" TEXT NOT NULL,
    "originalSubtaskId" TEXT NOT NULL,
    "copySubtaskId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubtaskShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubtaskShare_copySubtaskId_key" ON "SubtaskShare"("copySubtaskId");

-- CreateIndex
CREATE INDEX "SubtaskShare_originalSubtaskId_idx" ON "SubtaskShare"("originalSubtaskId");

-- CreateIndex
CREATE UNIQUE INDEX "SubtaskShare_originalSubtaskId_toUserId_key" ON "SubtaskShare"("originalSubtaskId", "toUserId");

-- AddForeignKey
ALTER TABLE "SubtaskShare" ADD CONSTRAINT "SubtaskShare_originalSubtaskId_fkey" FOREIGN KEY ("originalSubtaskId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtaskShare" ADD CONSTRAINT "SubtaskShare_copySubtaskId_fkey" FOREIGN KEY ("copySubtaskId") REFERENCES "Subtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtaskShare" ADD CONSTRAINT "SubtaskShare_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubtaskShare" ADD CONSTRAINT "SubtaskShare_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
