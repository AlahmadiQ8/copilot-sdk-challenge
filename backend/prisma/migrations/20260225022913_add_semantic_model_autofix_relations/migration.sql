-- CreateTable: SemanticModel
CREATE TABLE "SemanticModel" (
    "databaseName" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "serverAddress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Data migration: populate SemanticModel from existing AnalysisRun rows
INSERT OR IGNORE INTO "SemanticModel" ("databaseName", "modelName", "serverAddress", "createdAt", "updatedAt")
SELECT DISTINCT "databaseName", "modelName", "serverAddress", MIN("startedAt"), MIN("startedAt")
FROM "AnalysisRun"
WHERE "databaseName" IS NOT NULL AND "databaseName" != ''
GROUP BY "databaseName";

-- Insert a fallback model for rows with empty databaseName
INSERT OR IGNORE INTO "SemanticModel" ("databaseName", "modelName", "serverAddress", "createdAt", "updatedAt")
SELECT 'unknown', 'Unknown', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "AnalysisRun" WHERE "databaseName" IS NULL OR "databaseName" = '');

-- CreateTable: AutofixRun
CREATE TABLE "AutofixRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisRunId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scriptContent" TEXT,
    "output" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AutofixRun_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AutofixRun_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Redefine AnalysisRun: drop serverAddress/databaseName, add modelDatabaseName FK
CREATE TABLE "new_AnalysisRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelDatabaseName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AnalysisRun_modelDatabaseName_fkey" FOREIGN KEY ("modelDatabaseName") REFERENCES "SemanticModel" ("databaseName") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Data migration: map existing databaseName to modelDatabaseName (fallback to 'unknown')
INSERT INTO "new_AnalysisRun" ("id", "modelDatabaseName", "modelName", "startedAt", "completedAt", "status", "errorCount", "warningCount", "infoCount")
SELECT "id",
       CASE WHEN "databaseName" IS NOT NULL AND "databaseName" != '' THEN "databaseName" ELSE 'unknown' END,
       "modelName", "startedAt", "completedAt", "status", "errorCount", "warningCount", "infoCount"
FROM "AnalysisRun";
DROP TABLE "AnalysisRun";
ALTER TABLE "new_AnalysisRun" RENAME TO "AnalysisRun";

-- Redefine ChatFixSession: add FK to AnalysisRun
CREATE TABLE "new_ChatFixSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "copilotSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatFixSession_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatFixSession" ("analysisRunId", "copilotSessionId", "createdAt", "id", "ruleId", "status", "updatedAt")
SELECT "analysisRunId", "copilotSessionId", "createdAt", "id", "ruleId", "status", "updatedAt" FROM "ChatFixSession";
DROP TABLE "ChatFixSession";
ALTER TABLE "new_ChatFixSession" RENAME TO "ChatFixSession";
CREATE INDEX "ChatFixSession_ruleId_analysisRunId_status_idx" ON "ChatFixSession"("ruleId", "analysisRunId", "status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
