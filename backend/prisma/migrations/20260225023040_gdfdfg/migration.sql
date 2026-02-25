-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SemanticModel" (
    "databaseName" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "serverAddress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SemanticModel" ("createdAt", "databaseName", "modelName", "serverAddress", "updatedAt") SELECT "createdAt", "databaseName", "modelName", "serverAddress", "updatedAt" FROM "SemanticModel";
DROP TABLE "SemanticModel";
ALTER TABLE "new_SemanticModel" RENAME TO "SemanticModel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
