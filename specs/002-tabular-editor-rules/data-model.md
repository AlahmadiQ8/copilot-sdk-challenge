# Data Model: Tabular Editor Rules Engine

**Phase**: 1 | **Date**: 2026-02-23

## Schema Changes

**None.** This feature is an internal refactor of the rules evaluation engine. The existing Prisma schema is reused as-is — no new tables, no new columns, no migrations required.

## Affected Entities

### AnalysisRun (unchanged)

The `AnalysisRun` entity continues to track each analysis execution. The only behavioral change is that the analysis now invokes Tabular Editor CLI instead of executing DAX queries via MCP.

| Field | Usage in This Feature |
|-------|----------------------|
| `serverAddress` | Passed to Tabular Editor as the `<server>` CLI argument |
| `databaseName` | Passed to Tabular Editor as the `<database>` CLI argument |
| `status` | Set to `FAILED` if Tabular Editor process errors (timeout, crash, missing executable) |
| `errorCount` / `warningCount` / `infoCount` | Computed from parsed Tabular Editor output findings, same as before |

**Lifecycle**: `RUNNING` → `COMPLETED` | `FAILED` (unchanged)

### Finding (unchanged)

Each Tabular Editor violation maps 1:1 to an existing `Finding` record. The mapping from Tabular Editor console output to Finding fields:

| Finding Field | Source |
|---------------|--------|
| `ruleId` | Looked up from `bpa-rules.json` by matching rule `Name` to the console output rule name |
| `ruleName` | Directly from console output: the text inside `violates rule "..."` |
| `category` | Looked up from `bpa-rules.json` by rule `Name` → `Category` field |
| `severity` | Looked up from `bpa-rules.json` by rule `Name` → `Severity` field (1=Info, 2=Warning, 3=Error) |
| `description` | Looked up from `bpa-rules.json` by rule `Name` → `Description` field |
| `affectedObject` | Parsed from console output object reference (e.g., `'Sales'[Amount]`) |
| `objectType` | Parsed from console output leading type word (e.g., `Column`, `Measure`, `Table`) |
| `hasAutoFix` | Looked up from `bpa-rules.json` by rule `Name` → `FixExpression` field (true if non-empty) |
| `fixStatus` | Default `UNFIXED` (unchanged) |

**Lifecycle**: `UNFIXED` → `IN_PROGRESS` → `FIXED` | `FAILED` (unchanged)

### Entities Not Affected

- **FixSession** / **FixSessionStep**: AI fix orchestration — unchanged.
- **DaxQuery**: DAX query tab — unchanged. Note: `dax-rule-queries.json` (the manual DAX translations for BPA rules) is removed, but the `DaxQuery` table for user DAX queries is unrelated and stays.

## New Internal Data Structures (not persisted)

These TypeScript types are used at runtime during Tabular Editor output parsing. They are not stored in the database.

### TabularEditorViolation

```typescript
interface TabularEditorViolation {
  objectReference: string;  // Full object string, e.g., "Column 'Sales'[Amount]"
  objectType: string;       // Extracted type: "Column", "Measure", "Table", etc.
  affectedObject: string;   // Formatted path: "'Sales'[Amount]"
  ruleName: string;         // Rule display name from TE output
}
```

### RuleLookupMap

```typescript
// Built once from bpa-rules.json at analysis start
type RuleLookupMap = Map<string, {
  id: string;
  name: string;
  category: string;
  severity: number;
  description: string;
  hasFixExpression: boolean;
}>;
```

## Entity Relationship Diagram

No changes to the existing ERD. See [001 data-model.md](../001-pbi-analyzer-app/data-model.md) for the full diagram.

## Validation Rules

No changes to existing validation rules. All Finding field constraints remain the same:

| Entity | Field | Rule |
|--------|-------|------|
| Finding | severity | Must be 1, 2, or 3 |
| Finding | fixStatus | Must be one of: UNFIXED, IN_PROGRESS, FIXED, FAILED |
| Finding | objectType | Must be a valid Tabular Model object type (Column, Measure, Table, Relationship, Hierarchy, Partition, etc.) |
