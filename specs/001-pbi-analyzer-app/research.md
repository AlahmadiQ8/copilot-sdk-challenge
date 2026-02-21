# Research: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Phase**: 0 | **Date**: 2026-02-20

## R1: BPA Rules JSON Structure

**Decision**: Fetch and parse BPA rules directly from the community-maintained JSON at `raw.githubusercontent.com/microsoft/Analysis-Services/refs/heads/master/BestPracticeRules/BPARules.json`.

**Rationale**: This is the canonical source maintained by the Power BI community. The JSON format is well-structured and stable.

**Structure per rule**:
| Field | Type | Description |
|-------|------|-------------|
| `ID` | string | Unique rule identifier (e.g., `AVOID_FLOATING_POINT_DATA_TYPES`) |
| `Name` | string | Display name with category prefix (e.g., `[Performance] Do not use floating point data types`) |
| `Category` | string | Category: Performance, DAX Expressions, Error Prevention, Maintenance, Naming Conventions, Formatting |
| `Description` | string | Human-readable explanation with references |
| `Severity` | number | 1=Info, 2=Warning, 3=Error |
| `Scope` | string | Comma-separated object types the rule applies to (Table, Measure, DataColumn, CalculatedColumn, Relationship, Model, Partition, etc.) |
| `Expression` | string | Tabular Editor expression language — evaluation logic |
| `FixExpression` | string? | Optional auto-fix expression (only present for rules with deterministic fixes) |
| `CompatibilityLevel` | number | Minimum compatibility level required |

**Categories found**: Performance, DAX Expressions, Error Prevention, Maintenance, Naming Conventions, Formatting

**Key insight**: `FixExpression` is present on ~30% of rules (deterministic fixes like property changes: `IsHidden = true`, `DataType = DataType.Decimal`, `FormatString = "#,0"`, `Delete()`). Rules without `FixExpression` require AI-powered fixes.

**Alternatives considered**: Building a custom rules engine — rejected because the community set is comprehensive (50+ rules) and actively maintained.

---

## R2: Power BI Modeling MCP Server Capabilities

**Decision**: Use `@modelcontextprotocol/sdk` TypeScript client (`StdioClientTransport`) to connect to the Power BI Modeling MCP server as a stdio child process.

**Rationale**: The MCP server exposes all necessary operations for both reading model metadata (for analysis) and writing changes (for fixes). No REST API exists — MCP is the only programmatic interface.

**Available MCP tool categories** (confirmed via tool discovery):

| Tool | Key Operations | Used For |
|------|---------------|----------|
| `connection_operations` | Connect, ListLocalInstances, Disconnect | Establishing connection to PBI Desktop |
| `model_operations` | Get, GetStats, ExportTMDL | Reading full model metadata for analysis |
| `table_operations` | List, Get, Update, Rename, GetSchema | Listing tables, applying table-level fixes |
| `column_operations` | List, Get, Update, Rename, Create, Delete | Column metadata and fixes (data types, properties) |
| `measure_operations` | List, Get, Update, Rename, Create, Delete, Move | Measure expressions, fixes |
| `relationship_operations` | List, Get, Create, Update, Delete, Find | Relationship analysis and fixes |
| `dax_query_operations` | Execute, Validate | DAX query tab functionality |
| `partition_operations` | List, Get, Update | Partition analysis |
| `security_role_operations` | List, Get, GetPermissions | RLS analysis |
| `calculation_group_operations` | List, Get | Calculation group analysis |
| `user_hierarchy_operations` | List, Get | Hierarchy analysis |
| `perspective_operations` | List, Get | Perspective analysis |
| `trace_operations` | Start, Stop, Fetch | Query performance tracing |
| `transaction_operations` | Begin, Commit, Rollback | Atomic fix operations |

**Connection pattern** (for connecting to PBI Desktop):
```typescript
import { Client, StdioClientTransport } from '@modelcontextprotocol/sdk/client/index.js';

const transport = new StdioClientTransport({
    command: "C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe",
    args: ["--start"]  // or local path
});

const mcpClient = new Client({ name: 'pbi-analyzer', version: '1.0.0' });
await mcpClient.connect(transport);

// List local PBI Desktop instances
const instances = await mcpClient.callTool({
    name: 'connection_operations',
    arguments: { request: { operation: 'ListLocalInstances' } }
});

// Connect to a specific instance
await mcpClient.callTool({
    name: 'connection_operations',
    arguments: {
        request: {
            operation: 'Connect',
            dataSource: 'localhost:<port>',
            initialCatalog: '<database_name>'
        }
    }
});
```

**Alternatives considered**: Direct XMLA endpoint — rejected because MCP server wraps this with a developer-friendly interface and handles connection lifecycle.

---

## R3: BPA Rule Evaluation Strategy

**Decision**: Evaluate BPA rules by querying model metadata through MCP tools and matching against rule conditions on the backend.

**Rationale**: BPA rule `Expression` fields use Tabular Editor's expression language which cannot be executed directly. Instead, we fetch model metadata (tables, columns, measures, relationships, etc.) via MCP and evaluate rule conditions in TypeScript.

**Evaluation approach**:
1. Fetch all model metadata via MCP (`table_operations.List`, `column_operations.List`, `measure_operations.List`, `relationship_operations.List`, etc.)
2. For each BPA rule, parse the `Scope` to determine which objects to check
3. Translate rule `Expression` into TypeScript evaluation logic (pattern-matched for known expression types)
4. For simple property-check rules (e.g., `DataType = "Double"`), direct property comparison
5. For regex-based rules (e.g., `RegEx.IsMatch(Expression, "(?i)IFERROR\\s*\\(")`), apply regex on DAX expressions
6. For complex cross-object rules (e.g., references between measures/columns), use the fetched metadata graph

**Key categories of rule expressions**:
- **Property checks**: `DataType = "Double"`, `IsHidden == false`, `SummarizeBy <> "None"` → direct field comparison
- **Regex on DAX**: `RegEx.IsMatch(Expression, ...)` → JS RegExp evaluation on measure/column expressions
- **Cross-references**: `UsedInRelationships.Any()`, `ReferencedBy.Count = 0` → graph traversal on metadata
- **Model-level checks**: `Tables.Any(...)`, `Relationships.Where(...)` → aggregate checks
- **Annotation-based**: `GetAnnotation("Vertipaq_Cardinality")` → requires pre-computed annotations (skip if unavailable)

**Alternatives considered**: Shipping Tabular Editor CLI for rule evaluation — rejected for complexity and licensing reasons. The TypeScript evaluator covers the majority of rules, and annotation-based rules can be flagged as "requires manual check."

---

## R4: Copilot SDK Integration for AI Fixes

**Decision**: Use `@github/copilot-sdk` with MCP server integration for AI-powered fixes. Each fix creates a dedicated session with the Power BI Modeling MCP server attached.

**Rationale**: Copilot SDK natively supports MCP servers and session persistence, enabling the AI agent to read model state and apply fixes through the same MCP tools.

**Integration pattern**:
```typescript
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient();
const session = await client.createSession({
    model: 'gpt-4.1',
    sessionId: `fix-${findingId}`,
    streaming: true,
    mcpServers: {
        'powerbi-model': {
            type: 'stdio',
            command: "C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe",
            args: ["--start"]
        }
    },
    systemMessage: {
        content: `You are a Power BI modeling expert. Fix the following best practice violation...`
    }
});
```

**Session persistence**: Use `sessionId` mapped to finding ID for session inspection. Events (`tool.execution_start`, `tool.execution_complete`, `assistant.message_delta`) are captured and stored for agent session inspection.

**For deterministic fixes** (rules with `FixExpression`): Translate the `FixExpression` into the appropriate MCP tool call directly — no AI needed. E.g., `IsHidden = true` → `column_operations.Update({ isHidden: true })`.

**For AI fixes** (rules without `FixExpression`): Use Copilot SDK with the Power BI Modeling MCP server. The AI agent receives the finding context and uses MCP tools to analyze and fix.

**Alternatives considered**: Custom LLM orchestration — rejected per constitution Principle I (Simplicity). Copilot SDK handles planning, tool invocation, and session management.

---

## R5: Copilot SDK Integration for DAX Query Generation

**Decision**: Use `@github/copilot-sdk` with the Power BI Modeling MCP server for natural language → DAX query generation and testing.

**Rationale**: The Copilot agent can inspect the model schema through MCP tools (`table_operations.List`, `column_operations.List`, `measure_operations.List`) and generate contextually accurate DAX queries. Queries are validated and executed through `dax_query_operations.Validate` and `dax_query_operations.Execute`.

**Flow**:
1. User enters natural language description (e.g., "Show total sales by region for last year")
2. Backend creates Copilot session with Power BI MCP server attached
3. Agent inspects model schema, generates DAX query
4. Query is validated via `dax_query_operations.Validate`
5. If valid, executed via `dax_query_operations.Execute`
6. Results returned to frontend

**Alternatives considered**: Using a standalone LLM API (e.g., OpenAI directly) — rejected because Copilot SDK provides built-in MCP integration, session management, and tool invocation that would need to be built from scratch otherwise.

---

## R6: Prisma ORM with better-sqlite3 Driver Adapter

**Decision**: Use Prisma ORM v7 with the `better-sqlite3` driver adapter (`@prisma/adapter-better-sqlite3`) for persisting analysis runs, findings, and agent sessions.

**Rationale**: SQLite is appropriate for a single-user local tool (no concurrent writes concern). Prisma provides type-safe queries, automatic migrations, and excellent TypeScript integration. The `better-sqlite3` driver adapter replaces Prisma's built-in Rust-based SQLite engine with a native JavaScript driver, yielding faster synchronous queries, smaller install footprint (no Rust binary), and direct access to the underlying `better-sqlite3` instance if needed.

**Versions**:
- `prisma` / `@prisma/client`: **^7.4.1**
- `@prisma/adapter-better-sqlite3`: **^7.4.1**
- `better-sqlite3`: **^12.6.2**

**Project configuration** (`prisma.config.ts` at repo root):
```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

**Schema** (`prisma/schema.prisma`):
```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "sqlite"
}
```

Note: In Prisma v7 the generator is `"prisma-client"` (ESM-first), replacing the legacy `"prisma-client-js"`. The datasource URL is provided via `prisma.config.ts`, not in the schema.

**Client instantiation** (`src/models/prisma.ts`):
```typescript
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaBetterSqlite3({ url: connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
```

**Schema approach**:
- SQLite file stored at `backend/prisma/dev.db`
- Enums (Severity, FindingStatus, FixResult) implemented as string fields with TypeScript union types (SQLite doesn't support native enums; Prisma implements them at the ORM level)
- DateTime fields use `@default(now())` and `@updatedAt`
- Relations modeled with explicit foreign keys

**Alternatives considered**: Prisma's built-in Rust-based SQLite driver — viable but adds a ~15 MB Rust query engine binary. The `better-sqlite3` adapter is lighter, synchronous, and aligns with the Rust-free Prisma architecture direction.

---

## R7: Playwright Testing with Configurable Mock API

**Decision**: Use Playwright for E2E/UI tests with `page.route()` for mock API responses, controlled by an environment variable `USE_MOCK_API`.

**Rationale**: Playwright's `page.route()` API natively intercepts network requests per-page, enabling tests to run against mock data without modifying application code. The configurable flag allows switching between mock and real API for development flexibility.

**Pattern**:
```typescript
// frontend/tests/e2e/fixtures.ts
import { test as base } from '@playwright/test';

const USE_MOCK_API = process.env.USE_MOCK_API !== 'false'; // default: true

export const test = base.extend({
    page: async ({ page }, use) => {
        if (USE_MOCK_API) {
            await page.route('**/api/analyze', route => route.fulfill({
                status: 200,
                json: mockAnalysisResponse,
            }));
            await page.route('**/api/findings/**', route => route.fulfill({
                status: 200,
                json: mockFinding,
            }));
            // ... other API mocks
        }
        await use(page);
    },
});
```

**Configuration**:
- `USE_MOCK_API=true` (default): All API calls intercepted with mock responses
- `USE_MOCK_API=false`: Tests hit the real backend API

**Alternatives considered**: MSW (Mock Service Worker) — viable but adds a dependency when Playwright's built-in route mocking is sufficient per constitution Principle I.

---

## R8: MCP Client Architecture (Backend ↔ Power BI Desktop)

**Decision**: Maintain a single MCP client instance per connection on the backend, shared across API requests. The backend spawns the Power BI Modeling MCP server as a stdio child process.

**Rationale**: The MCP server maintains connection state internally. Spawning one instance and reusing it avoids overhead of reconnecting for each API call.

**Architecture**:
```
Browser (React) → Express API → MCP Client → (stdio) → PBI Modeling MCP Server → PBI Desktop (localhost)
                              → Copilot SDK → (MCP) → PBI Modeling MCP Server → PBI Desktop
                              → Prisma → SQLite
```

**Lifecycle**:
1. On `POST /api/connect`: Backend spawns MCP server process, creates MCP client, calls `connection_operations.Connect`
2. MCP client is stored in server-level state (singleton for single-user app)
3. Subsequent API calls use the stored client
4. On `POST /api/disconnect` or server shutdown: Calls `connection_operations.Disconnect`, closes transport

**Alternatives considered**: Spawning a new MCP server per request — rejected for performance. Proxying MCP from the browser — rejected for security (exposes PBI Desktop connection).
