-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "serverAddress" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisRunId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "affectedObject" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "fixStatus" TEXT NOT NULL DEFAULT 'UNFIXED',
    "fixSummary" TEXT,
    "hasAutoFix" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Finding_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "DaxQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryText" TEXT NOT NULL,
    "naturalLanguage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultData" TEXT,
    "rowCount" INTEGER,
    "executionTimeMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
