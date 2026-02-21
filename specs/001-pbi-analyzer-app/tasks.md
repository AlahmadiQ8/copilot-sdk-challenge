# Tasks: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Input**: Design documents from `/specs/001-pbi-analyzer-app/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/api.yaml, quickstart.md

**Tests**: Playwright E2E tests with configurable mock API are included (explicitly requested). Vitest unit tests for backend services are included per constitution Principle IV (NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Revision Note**: Tasks T001–T066 were completed under Prisma v6 with the built-in Rust-based SQLite driver. Research R6 has been updated to use Prisma ORM v7 with the `better-sqlite3` driver adapter. Phase 10 contains migration tasks to align the existing implementation with the updated research.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend entry: `backend/src/index.ts`
- Frontend entry: `frontend/src/App.tsx`
- Prisma-related exports: `backend/src/models/`
- API contract types: `backend/src/types/`, `frontend/src/types/`

---

## Phase 1: Setup (Shared Infrastructure) ✅

**Purpose**: Project initialization, dependency installation, and base configuration

- [X] T001 Create project directory structure with backend/ and frontend/ top-level folders per plan.md
- [X] T002 Initialize backend Node.js project with Express, TypeScript, Prisma, @modelcontextprotocol/sdk, @github/copilot-sdk, and Vitest dependencies in backend/package.json
- [X] T003 [P] Initialize frontend project with Vite, React 18, TypeScript, Tailwind CSS, React Router, and Monaco Editor dependencies in frontend/package.json
- [X] T004 [P] Create Prisma schema with all 5 models (AnalysisRun, Finding, FixSession, FixSessionStep, DaxQuery) and run initial migration in backend/prisma/schema.prisma
- [X] T005 [P] Configure TypeScript compiler options for backend in backend/tsconfig.json and frontend in frontend/tsconfig.json
- [X] T006 [P] Configure ESLint and Prettier for backend and frontend with shared rules in backend/.eslintrc.cjs, frontend/.eslintrc.cjs, and root .prettierrc
- [X] T007 [P] Create environment configuration files with documented variables in backend/.env.example and frontend/.env.example
- [X] T008 [P] Setup Playwright configuration with configurable mock API flag in frontend/playwright.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [X] T009 Create Express app entry point with CORS, JSON body parsing, and dev server startup on port 3001 in backend/src/index.ts
- [X] T010 [P] Create Prisma client singleton module in backend/src/models/prisma.ts
- [X] T011 [P] Create MCP client manager with spawn, connect, disconnect, health check, and singleton lifecycle in backend/src/mcp/client.ts
- [X] T012 [P] Create structured logging module with pino (timestamp, severity, correlation ID support) in backend/src/middleware/logger.ts
- [X] T013 [P] Create shared backend API types (request/response shapes matching contracts/api.yaml schemas) in backend/src/types/api.ts
- [X] T014 [P] Create frontend API types mirroring backend contracts in frontend/src/types/api.ts
- [X] T015 [P] Create error handling middleware with structured JSON error responses and error logging in backend/src/middleware/errorHandler.ts
- [X] T016 Create API route registration module mounting all route groups under /api in backend/src/routes/index.ts
- [X] T017 [P] Create BPA rules fetcher that loads rules from GitHub raw URL, parses JSON, and caches in-memory in backend/src/services/rules.service.ts

---

## Phase 3: User Story 1 — Connect & Analyze Semantic Model (Priority: P1) 🎯 MVP ✅

- [X] T018 [P] [US1] Create connection service wrapping MCP client for listInstances, connect, disconnect, getStatus in backend/src/services/connection.service.ts
- [X] T019 [P] [US1] Create analysis service with BPA rule evaluation engine that fetches model metadata via MCP and evaluates rules per research.md R3 strategy in backend/src/services/analysis.service.ts
- [X] T020 [P] [US1] Create connection routes (GET /connection/instances, POST /connection/connect, GET /connection/status, POST /connection/disconnect) in backend/src/routes/connection.routes.ts
- [X] T021 [P] [US1] Create analysis routes (POST /analysis/run, GET /analysis/runs, GET /analysis/runs/:runId) in backend/src/routes/analysis.routes.ts
- [X] T022 [P] [US1] Create findings routes (GET /analysis/runs/:runId/findings with severity/category/fixStatus/sort filters and limit/offset pagination, GET /findings/:findingId) in backend/src/routes/findings.routes.ts
- [X] T023 [P] [US1] Create rules route (GET /rules with optional category filter) in backend/src/routes/rules.routes.ts
- [X] T024 [P] [US1] Write Vitest unit tests for rules.service in backend/tests/unit/rules.service.test.ts
- [X] T025 [P] [US1] Write Vitest unit tests for analysis.service in backend/tests/unit/analysis.service.test.ts
- [X] T026 [P] [US1] Write Vitest unit tests for connection.service in backend/tests/unit/connection.service.test.ts
- [X] T027 [P] [US1] Create API client service in frontend/src/services/api.ts
- [X] T028 [US1] Create App component with React Router, two-tab layout in frontend/src/App.tsx
- [X] T029 [P] [US1] Create ConnectionPanel component in frontend/src/components/ConnectionPanel.tsx
- [X] T030 [P] [US1] Create SummaryBar component in frontend/src/components/SummaryBar.tsx
- [X] T031 [P] [US1] Create FindingCard component in frontend/src/components/FindingCard.tsx
- [X] T032 [P] [US1] Create FindingsFilter component in frontend/src/components/FindingsFilter.tsx
- [X] T033 [US1] Create AnalyzerPage in frontend/src/pages/AnalyzerPage.tsx

---

## Phase 4: User Story 2 — AI Auto-Fix Individual Findings (Priority: P2) ✅

- [X] T034 [P] [US2] Create AI fix service in backend/src/services/fix.service.ts
- [X] T035 [P] [US2] Create fix routes in backend/src/routes/fix.routes.ts
- [X] T036 [US2] Implement SSE streaming endpoint in backend/src/routes/fix.routes.ts
- [X] T037 [P] [US2] Write Vitest unit tests for fix.service in backend/tests/unit/fix.service.test.ts
- [X] T038 [P] [US2] Add "AI Fix" button to FindingCard in frontend/src/components/FindingCard.tsx
- [X] T039 [US2] Create FixProgressPanel component in frontend/src/components/FixProgressPanel.tsx
- [X] T040 [US2] Add fix-related API methods to frontend/src/services/api.ts

---

## Phase 5: User Story 3 — Rerun Analyzer After Fixes (Priority: P3) ✅

- [X] T041 [US3] Add rerun analysis logic in backend/src/services/analysis.service.ts
- [X] T042 [US3] Add "Rerun Analysis" button to frontend/src/pages/AnalyzerPage.tsx

---

## Phase 6: User Story 4 — Inspect AI Agent Session (Priority: P4) ✅

- [X] T043 [US4] Create fix session route in backend/src/routes/fix.routes.ts
- [X] T044 [P] [US4] Create SessionInspector component in frontend/src/components/SessionInspector.tsx
- [X] T045 [US4] Add "Inspect Session" button and panel to frontend/src/pages/AnalyzerPage.tsx

---

## Phase 7: User Story 5 — Generate & Test DAX Queries (Priority: P5) ✅

- [X] T046 [P] [US5] Create DAX execution service in backend/src/services/dax.service.ts
- [X] T047 [P] [US5] Create DAX generation service in backend/src/services/dax-generation.service.ts
- [X] T048 [US5] Create DAX routes in backend/src/routes/dax.routes.ts
- [X] T049 [P] [US5] Write Vitest unit tests for dax.service in backend/tests/unit/dax.service.test.ts
- [X] T050 [P] [US5] Create DaxEditor component in frontend/src/components/DaxEditor.tsx
- [X] T051 [P] [US5] Create QueryResultsTable component in frontend/src/components/QueryResultsTable.tsx
- [X] T052 [P] [US5] Create NaturalLanguageInput component in frontend/src/components/NaturalLanguageInput.tsx
- [X] T053 [US5] Create DaxQueryPage in frontend/src/pages/DaxQueryPage.tsx
- [X] T054 [US5] Add DAX API methods to frontend/src/services/api.ts

---

## Phase 8: User Story 6 — User-Friendly Navigation & Layout (Priority: P6) ✅

- [X] T055 [P] [US6] Create Toast notification component in frontend/src/components/Toast.tsx
- [X] T056 [P] [US6] Create LoadingSpinner and ProgressBar in frontend/src/components/LoadingIndicators.tsx
- [X] T057 [P] [US6] Create ErrorBoundary component in frontend/src/components/ErrorBoundary.tsx
- [X] T058 [US6] Add responsive Tailwind breakpoints across frontend/src/pages/
- [X] T059 [US6] Add WCAG 2.1 AA accessibility across frontend/src/components/
- [X] T060 [US6] Add connection-lost detection banner in frontend/src/components/ConnectionStatusBanner.tsx

---

## Phase 9: Polish & Cross-Cutting Concerns ✅

- [X] T061 [P] Create Playwright E2E test fixtures in frontend/tests/e2e/fixtures.ts
- [X] T062 [P] Create mock API response data in frontend/tests/e2e/mocks/responses.ts
- [X] T063 Create Playwright E2E test for analyzer flow in frontend/tests/e2e/analyzer.spec.ts
- [X] T064 [P] Create Playwright E2E test for AI fix flow in frontend/tests/e2e/fix.spec.ts
- [X] T065 [P] Create Playwright E2E test for DAX query flow in frontend/tests/e2e/dax-query.spec.ts
- [X] T066 Run quickstart.md validation

---

## Phase 10: Migrate to Prisma v7 with better-sqlite3 Driver Adapter ✅

**Purpose**: Align the existing implementation with updated research R6 — migrate from Prisma v6 (built-in Rust SQLite engine) to Prisma v7 with `better-sqlite3` driver adapter per research.md R6.

**⚠️ CRITICAL**: These tasks must be completed sequentially. The migration changes the Prisma client import path, generator config, and runtime adapter. All backend code that imports Prisma will need updating.

**Context**: Research R6 was revised to use Prisma ORM v7 (`^7.4.1`) with `@prisma/adapter-better-sqlite3` (`^7.4.1`) and `better-sqlite3` (`^12.6.2`). This replaces the built-in Rust-based SQLite engine with a native JavaScript driver, yielding a smaller install footprint (no Rust binary) and aligning with the Rust-free Prisma architecture direction.

### Dependencies & Package Updates

- [X] T067 Update backend/package.json: upgrade `prisma` and `@prisma/client` from `^6.5.0` to `^7.4.1`, add `@prisma/adapter-better-sqlite3` (`^7.4.1`) and `better-sqlite3` (`^12.6.2`) and `dotenv` (`^16.4.7`) to dependencies, add `@types/better-sqlite3` (`^7.6.13`) to devDependencies, then run `npm install` in backend/

### Prisma Schema & Config Migration

- [X] T068 Update backend/prisma/schema.prisma: change generator provider from `"prisma-client-js"` to `"prisma-client"`, add `output = "../generated/prisma"`, remove `url = env("DATABASE_URL")` from datasource block (URL now comes from prisma.config.ts)
- [X] T069 [P] Create backend/prisma.config.ts with `defineConfig()` from `"prisma/config"` providing schema path, migrations path, and datasource URL via `env("DATABASE_URL")` per research.md R6
- [X] T070 Delete existing backend/prisma/migrations/ directory and backend/prisma/prisma/dev.db (if present), then run `npx prisma migrate dev --name init` to recreate migration with new generator, and run `npx prisma generate` to produce the generated client at backend/generated/prisma/

### Client Instantiation Update

- [X] T071 Rewrite backend/src/models/prisma.ts to use `PrismaBetterSqlite3` adapter from `@prisma/adapter-better-sqlite3` and import `PrismaClient` from `../generated/prisma/client` instead of `@prisma/client`, passing the adapter instance to the `PrismaClient` constructor per research.md R6

### Verify & Fix Imports

- [X] T072 [P] Verify all backend service files that import from `backend/src/models/prisma.ts` (analysis.service.ts, dax.service.ts, dax-generation.service.ts, fix.service.ts) still work with the updated module — the default export remains `prisma` so import paths should be unchanged, but verify no code references `@prisma/client` types directly
- [X] T073 [P] Verify all backend unit tests (backend/tests/unit/*.test.ts) still pass — run `npm run test` in backend/ and fix any import or type errors caused by the Prisma v7 migration

### Update Design Documents

- [X] T074 [P] Update backend data-model.md Prisma schema block: change generator provider from `"prisma-client-js"` to `"prisma-client"`, add `output = "../generated/prisma"`, remove `url` from datasource block in specs/001-pbi-analyzer-app/data-model.md
- [X] T075 [P] Update quickstart.md to document new `prisma.config.ts` file, mention `better-sqlite3` in the technology stack table, and add `npx prisma generate` step after migration in specs/001-pbi-analyzer-app/quickstart.md

### Smoke Test

- [X] T076 Run `npm run dev` in backend/ to verify the Express server starts and Prisma connects to SQLite via the better-sqlite3 adapter without errors

**Checkpoint**: Backend fully migrated to Prisma v7 + better-sqlite3. All existing functionality preserved.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — completed ✅
- **Foundational (Phase 2)**: Depends on Setup — completed ✅
- **US1 (Phase 3)**: Depends on Foundational — completed ✅
- **US2 (Phase 4)**: Depends on Foundational — completed ✅
- **US3 (Phase 5)**: Depends on US1 — completed ✅
- **US4 (Phase 6)**: Depends on US2 — completed ✅
- **US5 (Phase 7)**: Depends on Foundational — completed ✅
- **US6 (Phase 8)**: Depends on US1 — completed ✅
- **Polish (Phase 9)**: Depends on US1, US2, US5 — completed ✅
- **Prisma v7 Migration (Phase 10)**: Depends on all prior phases — updates foundational infrastructure

### Phase 10 Internal Order

```
T067 (package.json update + npm install)
  ↓
T068 (schema.prisma update) ──┐
T069 (prisma.config.ts create) ─┤── can be parallel
                                 ↓
T070 (delete old migrations + re-migrate + generate)
  ↓
T071 (rewrite prisma.ts client)
  ↓
T072 (verify service imports) ──┐
T073 (verify unit tests)  ──────┤── can be parallel
T074 (update data-model.md) ────┤
T075 (update quickstart.md) ────┘
  ↓
T076 (smoke test)
```

### User Story Dependencies (unchanged)

```
Phase 1: Setup ✅
    ↓
Phase 2: Foundational ✅
    ↓
    ├── US1 (P1) ✅ ──→ US3 (P3) ✅ ──→ US6 (P6) ✅
    │       ↓
    │      US2 (P2) ✅ ──→ US4 (P4) ✅
    │
    └── US5 (P5) ✅ [fully independent]
    
    All ──→ Phase 9: Polish ✅
              ↓
         Phase 10: Prisma v7 Migration
```

---

## Implementation Strategy

### Prisma v7 Migration (Phase 10)

1. **T067**: Update `package.json` and install new deps — this is the prerequisite for everything
2. **T068 + T069**: Update schema and create config file (parallel — different files)
3. **T070**: Re-run migration with new generator to produce `generated/prisma/` output
4. **T071**: Rewrite the Prisma client singleton to use the adapter
5. **T072–T075**: Verify imports, tests, and update docs (all parallel — different files)
6. **T076**: Final smoke test — start the server and confirm everything works

**Risk**: The Prisma v7 migration changes the client import path from `@prisma/client` to `../generated/prisma/client`. All files importing Prisma types directly from `@prisma/client` will need updating. The `prisma.ts` module re-exports the client so most services import from there, but verify no service or test imports types directly from the old path.

---

## Summary

| Metric | Value |
|--------|-------|
| **Total tasks** | 76 |
| **Completed (Phase 1–9)** | 66 |
| **New migration tasks (Phase 10)** | 10 (T067–T076) |
| **Parallel opportunities in Phase 10** | T068+T069 parallel; T072+T073+T074+T075 parallel |
| **Files modified** | ~8 (package.json, schema.prisma, prisma.config.ts, prisma.ts, data-model.md, quickstart.md + verification) |
| **Files created** | 1 (backend/prisma.config.ts) |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Phase 10 is a cross-cutting infrastructure migration — no user story label
- The migration preserves all existing functionality; no user-facing changes
- After Phase 10, the `backend/generated/prisma/` directory will contain the generated Prisma client (should be gitignored)
- The `@prisma/client` package is still needed as a dependency but the runtime import path changes to `../generated/prisma/client`
