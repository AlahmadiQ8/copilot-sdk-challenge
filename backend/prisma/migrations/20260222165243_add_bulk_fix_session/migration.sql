-- CreateTable
CREATE TABLE "BulkFixSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalFindings" INTEGER NOT NULL,
    "fixedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BulkFixSessionStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bulkFixSessionId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkFixSessionStep_bulkFixSessionId_fkey" FOREIGN KEY ("bulkFixSessionId") REFERENCES "BulkFixSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
