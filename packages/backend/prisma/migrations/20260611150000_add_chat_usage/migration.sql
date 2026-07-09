-- CreateTable
CREATE TABLE "chat_usage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_usage_sessionId_idx" ON "chat_usage"("sessionId");

-- CreateIndex
CREATE INDEX "chat_usage_userId_yearMonth_idx" ON "chat_usage"("userId", "yearMonth");

-- CreateIndex
CREATE INDEX "chat_usage_yearMonth_idx" ON "chat_usage"("yearMonth");

-- AddForeignKey
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
