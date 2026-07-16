-- AlterEnum
ALTER TYPE "VerificationTokenType" ADD VALUE 'CONFIRM_CODE';

-- AlterTable
ALTER TABLE "verification_tokens" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;
