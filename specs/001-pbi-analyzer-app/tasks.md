# Tasks: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Input**: Design documents from `/specs/001-pbi-analyzer-app/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/api.yaml, quickstart.md

**Tests**: Playwright E2E tests with configurable mock API are included (explicitly requested). Vitest unit tests for backend services are included per constitution Principle IV (NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

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

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, and base configuration

- [ ] T001 Create project directory structure with backend/ and frontend/ top-level folders per plan.md
- [ ] T002 Initialize backend Node.js project with Express, TypeScript, Prisma, @modelcontextprotocol/sdk, @github/copilot-sdk, and Vitest dependencies in backend/package.json
- [ ] T003 [P] Initialize frontend project with Vite, React 18, TypeScript, Tailwind CSS, React Router, and Monaco Editor dependencies in frontend/package.json
- [ ] T004 [P] Create Prisma schema with all 5 models (AnalysisRun, Finding, FixSession, FixSessionStep, DaxQuery) and run initial migration in backend/prisma/schema.prisma
- [ ] T005 [P] Configure TypeScript compiler options for backend in backend/tsconfig.json and frontend in frontend/tsconfig.json
- [ ] T006 [P] Configure ESLint and Prettier for backend and frontend with shared rules in backend/.eslintrc.cjs, frontend/.eslintrc.cjs, and root .prettierrc
- [ ] T007 [P] Create environment configuration files with documented variables in backend/.env.example and frontend/.env.example
- [ ] T008 [P] Setup Playwright configuration with configurable mock API flag in frontend/playwright.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T009 Create Express app entry point with CORS, JSON body parsing, and dev server startup on port 3001 in backend/src/index.ts
- [ ] T010 [P] Create Prisma client singleton module in backend/src/models/prisma.ts
- [ ] T011 [P] Create MCP client manager with spawn, connect, disconnect, health check, and singleton lifecycle in backend/src/mcp/client.ts
- [ ] T012 [P] Create structured logging module with pino (timestamp, severity, correlation ID support) in backend/src/middleware/logger.ts
- [ ] T013 [P] Create shared backend API types (request/response shapes matching contracts/api.yaml schemas) in backend/src/types/api.ts
- [ ] T014 [P] Create frontend API types mirroring backend contracts in frontend/src/types/api.ts
- [ ] T015 [P] Create error handling middleware with structured JSON error responses and error logging in backend/src/middleware/errorHandler.ts
- [ ] T016 Create API route registration module mounting all route groups under /api in backend/src/routes/index.ts
- [ ] T017 [P] Create BPA rules fetcher that loads rules from GitHub raw URL, parses JSON, and caches in-memory in backend/src/services/rules.service.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Connect & Analyze Semantic Model (Priority: P1) 🎯 MVP

**Goal**: User connects to a Power BI Semantic Model, runs BPA analysis, and views categorized findings with severity, description, and affected objects

**Independent Test**: Connect to a sample Semantic Model, run the analyzer, and verify that known best-practice violations appear in the results list with correct severity, description, and affected object

### Backend Implementation for User Story 1

- [ ] T018 [P] [US1] Create connection service wrapping MCP client for listInstances, connect, disconnect, getStatus in backend/src/services/connection.service.ts
- [ ] T019 [P] [US1] Create analysis service with BPA rule evaluation engine that fetches model metadata via MCP and evaluates rules per research.md R3 strategy in backend/src/services/analysis.service.ts
- [ ] T020 [P] [US1] Create connection routes (GET /connection/instances, POST /connection/connect, GET /connection/status, POST /connection/disconnect) in backend/src/routes/connection.routes.ts
- [ ] T021 [P] [US1] Create analysis routes (POST /analysis/run, GET /analysis/runs, GET /analysis/runs/:runId) in backend/src/routes/analysis.routes.ts
- [ ] T022 [P] [US1] Create findings routes (GET /analysis/runs/:runId/findings with severity/category/fixStatus/sort filters and limit/offset pagination, GET /findings/:findingId) in backend/src/routes/findings.routes.ts
- [ ] T023 [P] [US1] Create rules route (GET /rules with optional category filter) in backend/src/routes/rules.routes.ts

### Unit Tests for User Story 1

- [ ] T024 [P] [US1] Write Vitest unit tests for rules.service (fetch, parse, cache, filter by category) in backend/tests/unit/rules.service.test.ts
- [ ] T025 [P] [US1] Write Vitest unit tests for analysis.service (rule evaluation engine: property checks, regex-based rules, cross-reference rules) with mocked MCP client in backend/tests/unit/analysis.service.test.ts
- [ ] T026 [P] [US1] Write Vitest unit tests for connection.service (connect, disconnect, status, listInstances) with mocked MCP client in backend/tests/unit/connection.service.test.ts

### Frontend Implementation for User Story 1

- [ ] T027 [P] [US1] Create API client service with connection and analysis methods (listInstances, connect, disconnect, getStatus, runAnalysis, getFindings, getRules) in frontend/src/services/api.ts
- [ ] T028 [US1] Create App component with React Router, two-tab layout (Analyzer, DAX Queries), and connection status header in frontend/src/App.tsx
- [ ] T029 [P] [US1] Create ConnectionPanel component with instance dropdown selector, connect/disconnect buttons, and status display in frontend/src/components/ConnectionPanel.tsx
- [ ] T030 [P] [US1] Create SummaryBar component displaying error, warning, and info counts with color-coded badges in frontend/src/components/SummaryBar.tsx
- [ ] T031 [P] [US1] Create FindingCard component showing severity badge, rule name, category, description, affected object, and fix status in frontend/src/components/FindingCard.tsx
- [ ] T032 [P] [US1] Create FindingsFilter component with severity, category, and fix status dropdowns plus sort controls in frontend/src/components/FindingsFilter.tsx
- [ ] T033 [US1] Create AnalyzerPage integrating ConnectionPanel, SummaryBar, FindingsFilter, and FindingCard list with run-analysis button in frontend/src/pages/AnalyzerPage.tsx

**Checkpoint**: User Story 1 fully functional — user can connect, analyze, and browse findings

---

## Phase 4: User Story 2 — AI Auto-Fix Individual Findings (Priority: P2)

**Goal**: User triggers an AI-powered fix for a specific finding; the system applies the fix via Copilot SDK + MCP and reports success/failure with a change summary

**Independent Test**: Select a known fixable finding, trigger AI fix, and verify the finding status updates to Fixed with a summary of changes applied

### Backend Implementation for User Story 2

- [ ] T034 [P] [US2] Create AI fix service integrating Copilot SDK with Power BI Modeling MCP server for intelligent fixes and direct MCP calls for deterministic FixExpression rules in backend/src/services/fix.service.ts
- [ ] T035 [P] [US2] Create fix routes (POST /findings/:findingId/fix, GET /findings/:findingId/fix/stream SSE) in backend/src/routes/fix.routes.ts
- [ ] T036 [US2] Implement SSE streaming endpoint that emits fix session step events in real-time as the Copilot agent works in backend/src/routes/fix.routes.ts

### Unit Tests for User Story 2

- [ ] T037 [P] [US2] Write Vitest unit tests for fix.service (deterministic fix path, AI fix path, session creation, step recording, status transitions) with mocked Copilot SDK and MCP client in backend/tests/unit/fix.service.test.ts

### Frontend Implementation for User Story 2

- [ ] T038 [P] [US2] Add "AI Fix" button to FindingCard component with loading state and status badge updates in frontend/src/components/FindingCard.tsx
- [ ] T039 [US2] Create FixProgressPanel component that subscribes to SSE stream and displays real-time fix steps in frontend/src/components/FixProgressPanel.tsx
- [ ] T040 [US2] Add fix-related API methods (triggerFix, streamFixProgress via EventSource) to frontend API service in frontend/src/services/api.ts

**Checkpoint**: User Story 2 fully functional — user can trigger AI fix and see real-time progress

---

## Phase 5: User Story 3 — Rerun Analyzer After Fixes (Priority: P3)

**Goal**: User reruns analysis after applying fixes and sees which findings are resolved and which remain

**Independent Test**: Apply a fix to a finding, rerun the analyzer, and verify the previously flagged finding no longer appears (or shows as resolved)

### Backend Implementation for User Story 3

- [ ] T041 [US3] Add rerun analysis logic to analysis service that creates a new AnalysisRun and supports comparison with the previous run to identify resolved findings in backend/src/services/analysis.service.ts

### Frontend Implementation for User Story 3

- [ ] T042 [US3] Add "Rerun Analysis" button to AnalyzerPage and update findings list to show resolved vs remaining findings after rerun in frontend/src/pages/AnalyzerPage.tsx

**Checkpoint**: User Story 3 fully functional — user can rerun analysis and verify fixes

---

## Phase 6: User Story 4 — Inspect AI Agent Session (Priority: P4)

**Goal**: User inspects the step-by-step AI reasoning, tool calls, and outcomes for any finding that had a fix attempted

**Independent Test**: Trigger an AI fix, open the session inspector, and verify the session log shows reasoning steps, actions, and model changes with timestamps

### Backend Implementation for User Story 4

- [ ] T043 [US4] Create fix session route returning full session with steps ordered by stepNumber (GET /findings/:findingId/fix/session) in backend/src/routes/fix.routes.ts

### Frontend Implementation for User Story 4

- [ ] T044 [P] [US4] Create SessionInspector component rendering chronological steps (reasoning, tool_call, tool_result, message, error) with timestamps and total duration in frontend/src/components/SessionInspector.tsx
- [ ] T045 [US4] Add "Inspect Session" button to FindingCard and integrate SessionInspector as a slide-over panel or modal in frontend/src/pages/AnalyzerPage.tsx

**Checkpoint**: User Story 4 fully functional — user can inspect any AI fix session in detail

---

## Phase 7: User Story 5 — Generate & Test DAX Queries (Priority: P5)

**Goal**: User writes or AI-generates DAX queries, executes them against the connected model, and views tabular results with execution metadata

**Independent Test**: Navigate to DAX tab, enter `EVALUATE 'Sales'`, execute, and verify results display in a tabular format with row count and execution time

### Backend Implementation for User Story 5

- [ ] T046 [P] [US5] Create DAX execution service wrapping MCP dax_query_operations (Execute, Validate) with cancellation support in backend/src/services/dax.service.ts
- [ ] T047 [P] [US5] Create DAX generation service using Copilot SDK with Power BI MCP server for natural language to DAX conversion in backend/src/services/dax-generation.service.ts
- [ ] T048 [US5] Create DAX routes (POST /dax/execute, POST /dax/generate, GET /dax/history with limit+offset, POST /dax/:queryId/cancel) in backend/src/routes/dax.routes.ts

### Unit Tests for User Story 5

- [ ] T049 [P] [US5] Write Vitest unit tests for dax.service (execute, validate, cancel, error handling) with mocked MCP client in backend/tests/unit/dax.service.test.ts

### Frontend Implementation for User Story 5

- [ ] T050 [P] [US5] Create DaxEditor component integrating Monaco Editor with DAX language configuration in frontend/src/components/DaxEditor.tsx
- [ ] T051 [P] [US5] Create QueryResultsTable component with scrolling, column resizing, column headers, row count, and execution time in frontend/src/components/QueryResultsTable.tsx
- [ ] T052 [P] [US5] Create NaturalLanguageInput component with text input and "Generate DAX" button in frontend/src/components/NaturalLanguageInput.tsx
- [ ] T053 [US5] Create DaxQueryPage integrating DaxEditor, NaturalLanguageInput, QueryResultsTable, AI explanation display panel, cancel button, and query history sidebar in frontend/src/pages/DaxQueryPage.tsx
- [ ] T054 [US5] Add DAX API methods (executeDax, generateDax, getDaxHistory, cancelDaxQuery) to frontend API service in frontend/src/services/api.ts

**Checkpoint**: User Story 5 fully functional — user can write, generate, cancel, and execute DAX queries

---

## Phase 8: User Story 6 — User-Friendly Navigation & Layout (Priority: P6)

**Goal**: The app provides polished UX with responsive layout, visual feedback, keyboard accessibility, WCAG 2.1 AA compliance, and error handling across all features

**Independent Test**: Navigate through all tabs and features, verify responsive behavior at 1024px–2560px, confirm keyboard navigation works, and check all actions provide visual feedback

### Frontend Implementation for User Story 6

- [ ] T055 [P] [US6] Create Toast notification component for success/error/info messages in frontend/src/components/Toast.tsx
- [ ] T056 [P] [US6] Create LoadingSpinner and ProgressBar reusable components in frontend/src/components/LoadingIndicators.tsx
- [ ] T057 [P] [US6] Create ErrorBoundary component with fallback UI for unhandled errors in frontend/src/components/ErrorBoundary.tsx
- [ ] T058 [US6] Add responsive Tailwind breakpoints and layout adjustments for 1024px–2560px viewports across all pages in frontend/src/pages/
- [ ] T059 [US6] Add WCAG 2.1 AA accessibility: keyboard navigation, visible focus indicators, ARIA landmarks/labels, color contrast ratios (4.5:1), skip-navigation link across all components in frontend/src/components/
- [ ] T060 [US6] Add connection-lost detection banner with reconnect button and session preservation (findings and query history persist in DB) in frontend/src/components/ConnectionStatusBanner.tsx and backend/src/mcp/client.ts

**Checkpoint**: All user stories polished with consistent UX, accessibility, and error handling

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, final validation, and documentation

### Playwright E2E Tests

- [ ] T061 [P] Create Playwright E2E test fixtures with configurable mock API (USE_MOCK_API env var) and page.route() interception in frontend/tests/e2e/fixtures.ts
- [ ] T062 [P] Create mock API response data for all endpoints (connection, analysis, findings, fix, DAX) in frontend/tests/e2e/mocks/responses.ts
- [ ] T063 Create Playwright E2E test for connect-and-analyze flow (US1) in frontend/tests/e2e/analyzer.spec.ts
- [ ] T064 [P] Create Playwright E2E test for AI fix flow (US2) in frontend/tests/e2e/fix.spec.ts
- [ ] T065 [P] Create Playwright E2E test for DAX query flow (US5) in frontend/tests/e2e/dax-query.spec.ts

### Validation

- [ ] T066 Run quickstart.md validation — verify all setup steps, dev scripts, and environment variables work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — no other story dependencies
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) — integrates with US1 FindingCard but independently testable
- **US3 (Phase 5)**: Depends on US1 (Phase 3) — needs existing analysis run to compare against
- **US4 (Phase 6)**: Depends on US2 (Phase 4) — needs fix sessions to exist for inspection
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) — fully independent of analyzer stories
- **US6 (Phase 8)**: Depends on US1 (Phase 3) — polishes existing UI components
- **Polish (Phase 9)**: Depends on US1, US2, US5 at minimum for meaningful E2E tests

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS ALL)
    ↓
    ├── US1 (P1) ──→ US3 (P3) ──→ US6 (P6)
    │       ↓
    │      US2 (P2) ──→ US4 (P4)
    │
    └── US5 (P5) [fully independent]
    
    All ──→ Phase 9: Polish
```

### Within Each User Story

- Backend routes depend on their respective services
- Unit tests for services can run in parallel with frontend work
- Frontend components can be built in parallel with backend
- Page-level components depend on their child components
- API client methods should exist before pages integrate them

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006, T007, T008 all run in parallel after T001+T002
- **Phase 2**: T010, T011, T012, T013, T014, T015, T017 all run in parallel after T009
- **Phase 3**: All backend routes (T020–T023) parallel; all unit tests (T024–T026) parallel; all frontend components (T029–T032) parallel; backend and frontend can be developed in parallel
- **Phase 4**: T034 and T035 parallel; T037 parallel with frontend; T038 parallel with backend work
- **Phase 7**: T046 and T047 parallel; T049 parallel with frontend; T050, T051, T052 parallel
- **US1 and US5**: Fully independent — can be developed in parallel by different developers

---

## Parallel Example: User Story 1

```bash
# Backend — all route files can be created in parallel:
Task T020: "Create connection routes in backend/src/routes/connection.routes.ts"
Task T021: "Create analysis routes in backend/src/routes/analysis.routes.ts"
Task T022: "Create findings routes in backend/src/routes/findings.routes.ts"
Task T023: "Create rules route in backend/src/routes/rules.routes.ts"

# Unit tests — all test files in parallel (different files, mocked deps):
Task T024: "Unit tests for rules.service in backend/tests/unit/rules.service.test.ts"
Task T025: "Unit tests for analysis.service in backend/tests/unit/analysis.service.test.ts"
Task T026: "Unit tests for connection.service in backend/tests/unit/connection.service.test.ts"

# Frontend — all leaf components can be created in parallel:
Task T029: "Create ConnectionPanel in frontend/src/components/ConnectionPanel.tsx"
Task T030: "Create SummaryBar in frontend/src/components/SummaryBar.tsx"
Task T031: "Create FindingCard in frontend/src/components/FindingCard.tsx"
Task T032: "Create FindingsFilter in frontend/src/components/FindingsFilter.tsx"

# Then the page (depends on components above):
Task T033: "Create AnalyzerPage in frontend/src/pages/AnalyzerPage.tsx"
```

## Parallel Example: US1 + US5 Simultaneous

```bash
# Developer A: User Story 1 (Analyzer)
Phase 3 tasks (T018–T033)

# Developer B: User Story 5 (DAX Queries) — fully independent
Phase 7 tasks (T046–T054)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Connect to PBI Desktop, run analysis, verify findings display, run unit tests
5. Deploy/demo if ready — this alone delivers value

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. **Add US1** → Connect & Analyze works → **Demo MVP!**
3. **Add US2** → AI Fix works → Demo
4. **Add US3** → Rerun verification works → Demo
5. **Add US4** → Session inspection works → Demo
6. **Add US5** → DAX query tab works → Demo (can be started in parallel with US2–US4)
7. **Add US6** → Polish UX → Demo
8. **Add E2E Tests** → Quality gate → Release

### Parallel Team Strategy

With two developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - **Developer A**: US1 → US2 → US3 → US4 (analyzer flow)
   - **Developer B**: US5 → US6 → E2E Tests (DAX + polish)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- BPA rule evaluation engine (T019) is the most complex single task — see research.md R3 for strategy
- Copilot SDK integration (T034, T047) requires GitHub Copilot authentication — see research.md R4, R5
- MCP client manager (T011) follows singleton pattern with health check per research.md R8
- Structured logging (T012) uses correlation IDs from AnalysisRun.id and FixSession.id per constitution Principle V
- Unit tests use mocked Prisma client and MCP client per constitution Principle IV — no network/DB in tests
