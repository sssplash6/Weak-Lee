-- CreateTable
CREATE TABLE "DayTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayTask_userId_date_idx" ON "DayTask"("userId", "date");

-- AddForeignKey
ALTER TABLE "DayTask" ADD CONSTRAINT "DayTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
