-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_avatar_key" ON "User"("avatar");
