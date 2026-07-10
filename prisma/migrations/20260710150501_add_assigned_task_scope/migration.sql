-- CreateEnum
CREATE TYPE "AssignScope" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "AssignedTask" ADD COLUMN     "scope" "AssignScope" NOT NULL DEFAULT 'WEEKLY';
