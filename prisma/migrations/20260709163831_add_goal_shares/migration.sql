-- CreateTable
CREATE TABLE "GoalShare" (
    "id" TEXT NOT NULL,
    "originalGoalId" TEXT NOT NULL,
    "copyGoalId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoalShare_copyGoalId_key" ON "GoalShare"("copyGoalId");

-- CreateIndex
CREATE INDEX "GoalShare_originalGoalId_idx" ON "GoalShare"("originalGoalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalShare_originalGoalId_toUserId_key" ON "GoalShare"("originalGoalId", "toUserId");

-- AddForeignKey
ALTER TABLE "GoalShare" ADD CONSTRAINT "GoalShare_originalGoalId_fkey" FOREIGN KEY ("originalGoalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalShare" ADD CONSTRAINT "GoalShare_copyGoalId_fkey" FOREIGN KEY ("copyGoalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalShare" ADD CONSTRAINT "GoalShare_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalShare" ADD CONSTRAINT "GoalShare_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
