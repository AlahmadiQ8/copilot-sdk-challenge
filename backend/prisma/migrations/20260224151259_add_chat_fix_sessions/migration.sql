-- CreateTable
CREATE TABLE "ChatFixSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "copilotSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatFixMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatFixSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "proposalId" TEXT,
    "approvalStatus" TEXT,
    "ordering" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatFixMessage_chatFixSessionId_fkey" FOREIGN KEY ("chatFixSessionId") REFERENCES "ChatFixSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatFixSession_ruleId_analysisRunId_status_idx" ON "ChatFixSession"("ruleId", "analysisRunId", "status");
