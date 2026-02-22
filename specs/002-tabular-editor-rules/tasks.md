# Tasks: Tabular Editor Rules Engine

**Input**: Design documents from `/specs/002-tabular-editor-rules/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — the existing codebase has unit tests and the constitution mandates unit testing (Principle IV).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `backend/tests/`
- Frontend is unchanged for this feature

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment configuration and project setup for Tabular Editor integration

- [ ] T001 Add `TABULAR_EDITOR_PATH` and `TABULAR_EDITOR_TIMEOUT` to `backend/.env` with documented values
- [ ] T002 [P] Add `TABULAR_EDITOR_PATH` and `TABULAR_EDITOR_TIMEOUT` to `backend/.env.example` with placeholder values and comments

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service that ALL user stories depend on — Tabular Editor CLI invocation and output parsing

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational

- [ ] T003 Create unit tests for `parseConsoleOutput()` in `backend/tests/unit/tabular-editor.service.test.ts` — test parsing of column violations (`Column 'Table'[Col] violates rule "..."`), measure violations (`Measure [Name] violates rule "..."`), table violations (`Table 'Name' violates rule "..."`), calculated table violations, relationship violations, empty output, and lines that don't match the violation pattern
- [ ] T004 [P] Create unit tests for `buildRuleLookupMap()` in `backend/tests/unit/tabular-editor.service.test.ts` — test map creation from BPA rules array, lookup by rule name, handling of rules with/without FixExpression, and unknown rule name lookup
- [ ] T005 [P] Create unit tests for `parseObjectReference()` in `backend/tests/unit/tabular-editor.service.test.ts` — test extraction of objectType, tableName, and objectName from each console output pattern (column with table, measure without table, table only, calculated table, relationship)
- [ ] T006 Create unit tests for `runTabularEditor()` in `backend/tests/unit/tabular-editor.service.test.ts` — test successful execution returning stdout, non-zero exit code throwing error with stderr, timeout scenario, executable not found scenario (mock `child_process.execFile` and `fs.access`)

### Implementation

- [ ] T007 Create `backend/src/services/tabular-editor.service.ts` — export constants `TABULAR_EDITOR_PATH_ENV`, `TABULAR_EDITOR_TIMEOUT_ENV`, `DEFAULT_TIMEOUT`, `VIOLATION_REGEX`
- [ ] T008 Implement `buildRuleLookupMap()` in `backend/src/services/tabular-editor.service.ts` — accepts BPA rules array, returns `Map<string, RuleMetadata>` keyed by rule `Name` field with id, name, category, severity, description, hasFixExpression
- [ ] T009 Implement `parseObjectReference()` in `backend/src/services/tabular-editor.service.ts` — accepts the object reference string (text before "violates rule"), returns `{ objectType, tableName, objectName, affectedObject }` by extracting leading type word(s), single-quoted table name, and bracketed object name
- [ ] T010 Implement `parseConsoleOutput()` in `backend/src/services/tabular-editor.service.ts` — accepts stdout string and `RuleLookupMap`, splits into lines, matches each against `VIOLATION_REGEX`, calls `parseObjectReference()` for matched lines, looks up rule metadata, returns array of finding objects (ruleId, ruleName, category, severity, description, affectedObject, objectType, hasAutoFix)
- [ ] T011 Implement `validateTabularEditorPath()` in `backend/src/services/tabular-editor.service.ts` — reads `TABULAR_EDITOR_PATH` from `process.env`, validates path exists via `fs.access`, throws descriptive error if env var not set or file not found
- [ ] T012 Implement `runTabularEditor()` in `backend/src/services/tabular-editor.service.ts` — accepts serverAddress, databaseName, rulesFilePath; calls `validateTabularEditorPath()`; invokes `child_process.execFile` with args `[serverAddress, databaseName, '-A', rulesFilePath]` and timeout from `TABULAR_EDITOR_TIMEOUT` env var (default 120000ms); returns `{ stdout, stderr, exitCode }`; throws on non-zero exit with stderr details
- [ ] T013 Implement `evaluateRulesWithTabularEditor()` in `backend/src/services/tabular-editor.service.ts` — accepts serverAddress, databaseName, rules array, logger; builds rule lookup map; resolves BPA rules file path (`backend/src/data/bpa-rules.json`); calls `runTabularEditor()`; calls `parseConsoleOutput()` on stdout; logs process spawn, exit, finding count; returns array of finding objects

**Checkpoint**: Foundation ready — `tabular-editor.service.ts` is complete with full test coverage. User story implementation can now begin.

---

## Phase 3: User Story 1 — Full BPA Rule Evaluation via Tabular Editor (Priority: P1) 🎯 MVP

**Goal**: Replace DAX-query-based evaluation with Tabular Editor CLI in the analysis flow. Running an analysis evaluates all 71 BPA rules.

**Independent Test**: Connect to a Power BI model, run analysis, verify findings include rules that had no DAX query coverage (e.g., `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`).

### Tests for User Story 1

- [ ] T014 Update unit tests in `backend/tests/unit/analysis.service.test.ts` — replace DAX/MCP mocks with mock of `evaluateRulesWithTabularEditor` from `tabular-editor.service.js`; test that `runAnalysis()` calls the TE service with correct serverAddress, databaseName, and rules; test findings are persisted via `prisma.finding.createMany`; test that analysis status transitions to COMPLETED with correct counts; test analysis FAILED when TE service throws

### Implementation for User Story 1

- [ ] T015 [US1] Modify `backend/src/services/analysis.service.ts` — add import for `evaluateRulesWithTabularEditor` from `./tabular-editor.service.js`
- [ ] T016 [US1] Modify `processAnalysis()` in `backend/src/services/analysis.service.ts` — replace call to `evaluateRules(rules, log)` with call to `evaluateRulesWithTabularEditor(serverAddress, databaseName, rules, log)` where serverAddress and databaseName come from the analysis run record
- [ ] T017 [US1] Remove DAX evaluation code from `backend/src/services/analysis.service.ts` — delete `DaxRuleQuery` interface, `cachedDaxRuleQueries`, `loadDaxRuleQueries()`, `evaluateRules()`, `parseDaxResult()`, `parseCsvResponse()`, `parseCsvLine()`, `getPropStr()`, `RuleEvaluation` interface, `BATCH_SIZE` constant, and the `readFileSync` import (if no longer needed)
- [ ] T018 [US1] Delete `backend/src/data/dax-rule-queries.json`

**Checkpoint**: Analysis runs now use Tabular Editor. All 71 BPA rules are evaluated. DAX-query code is removed.

---

## Phase 4: User Story 2 — Configurable Tabular Editor Path (Priority: P1)

**Goal**: Tabular Editor path is read from environment variable with clear error messages for misconfiguration.

**Independent Test**: Set `TABULAR_EDITOR_PATH` to a valid path → analysis works. Set to invalid path → clear error. Unset → clear error.

> **Note**: This story's core implementation is already in Phase 2 (T011 `validateTabularEditorPath`). This phase covers integration testing and error flow validation.

### Tests for User Story 2

- [ ] T019 [US2] Add unit tests in `backend/tests/unit/tabular-editor.service.test.ts` — test `validateTabularEditorPath()` with: `TABULAR_EDITOR_PATH` not set (throws with "not configured" message), path set to non-existent file (throws with "not found at" message), path set to valid file (resolves without error)

### Implementation for User Story 2

- [ ] T020 [US2] Verify `runAnalysis()` in `backend/src/services/analysis.service.ts` surfaces TE path validation errors to the API layer with appropriate status codes (422 for config errors) — add early validation call at the start of `runAnalysis()` before creating the analysis run record

**Checkpoint**: Path misconfiguration produces clear, user-understandable errors before any analysis run is created.

---

## Phase 5: User Story 3 — Recheck Individual Finding with Tabular Editor (Priority: P2)

**Goal**: Rechecking a finding re-runs Tabular Editor analysis and checks if the specific violation is still present.

**Independent Test**: Run analysis, note a finding, fix the model object, recheck the finding → status changes to FIXED.

### Tests for User Story 3

- [ ] T021 [US3] Add unit tests for the new `recheckFinding()` in `backend/tests/unit/analysis.service.test.ts` — test recheck when violation is still present (status remains UNFIXED), test recheck when violation is gone (status changes to FIXED), test recheck when finding not found (throws 404), test recheck when not connected (throws 422)

### Implementation for User Story 3

- [ ] T022 [US3] Rewrite `recheckFinding()` in `backend/src/services/analysis.service.ts` — replace DAX-based recheck with: call `evaluateRulesWithTabularEditor()` to get all current violations, check if `finding.ruleId + finding.affectedObject` combination exists in results, update finding fixStatus to FIXED or UNFIXED accordingly
- [ ] T023 [US3] Remove MCP client imports from `backend/src/services/analysis.service.ts` if `recheckFinding()` was the last consumer — remove `getMcpClient` import (keep `getConnectionStatus`)

**Checkpoint**: Rechecking findings uses Tabular Editor. Feature parity with previous DAX-based recheck is maintained.

---

## Phase 6: User Story 4 — Graceful Degradation on Tabular Editor Failure (Priority: P2)

**Goal**: All Tabular Editor failure scenarios (crash, timeout, permissions) produce clear error messages and properly mark analysis runs as FAILED.

**Independent Test**: Misconfigure TE path → clear error. Simulate timeout → analysis marked FAILED with timeout message.

> **Note**: Core error handling is in Phase 2 (T006 tests, T011-T012 implementation). This phase ensures end-to-end error propagation.

### Tests for User Story 4

- [ ] T024 [US4] Add integration-style unit tests in `backend/tests/unit/analysis.service.test.ts` — test that when `evaluateRulesWithTabularEditor` throws a timeout error, `processAnalysis()` marks the run as FAILED; test that when it throws a crash error, the run is marked FAILED; test that stderr content is included in the error log

### Implementation for User Story 4

- [ ] T025 [US4] Ensure `processAnalysis()` in `backend/src/services/analysis.service.ts` logs TE-specific error details (timeout vs crash vs permission) in its catch block using structured logging with the error type
- [ ] T026 [US4] Add timeout and signal detection in `runTabularEditor()` in `backend/src/services/tabular-editor.service.ts` — when the execFile callback error has `killed === true` or `signal === 'SIGTERM'`, throw with a timeout-specific message; when exit code is non-zero without kill, throw with stderr content

**Checkpoint**: All TE failure modes produce clear, actionable error messages. Analysis runs are never left in RUNNING state.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T027 [P] Run `npm test` in `backend/` to verify all unit tests pass
- [ ] T028 [P] Run quickstart.md validation — start backend with `TABULAR_EDITOR_PATH` configured, connect to PBI Desktop, run analysis, verify findings appear
- [ ] T029 Verify no unused imports or dead code remain in `backend/src/services/analysis.service.ts` after DAX removal

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational completion
- **US2 (Phase 4)**: Depends on Foundational completion (can run in parallel with US1)
- **US3 (Phase 5)**: Depends on US1 completion (needs DAX code removed first)
- **US4 (Phase 6)**: Depends on Foundational completion (can run in parallel with US1/US2)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 — no other story dependencies. This is the MVP.
- **US2 (P1)**: Depends on Phase 2 — independent of US1 (validation already built into TE service)
- **US3 (P2)**: Depends on US1 — needs DAX code removed so `recheckFinding()` can be fully rewritten
- **US4 (P2)**: Depends on Phase 2 — independent of US1/US2 (error handling is in TE service)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Core functions before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel
- **Phase 2**: T004 and T005 can run in parallel (different test groups). T003 must be first (other tests depend on parse functions). T006 after T003-T005. Implementation T007 → T008/T009 (parallel) → T010 → T011 → T012 → T013
- **Phase 3-6**: US2 and US4 can run in parallel with US1 (different concerns, different files). US3 must wait for US1.
- **Phase 7**: T027 and T028 can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```
# Tests (write first, verify they fail):
T003: parseConsoleOutput tests
  ↓
T004 + T005: buildRuleLookupMap tests + parseObjectReference tests (parallel — different test blocks)
  ↓
T006: runTabularEditor tests (depends on understanding the interface)

# Implementation:
T007: Constants and types
  ↓
T008 + T009: buildRuleLookupMap + parseObjectReference (parallel — independent functions)
  ↓
T010: parseConsoleOutput (depends on T008, T009)
  ↓
T011: validateTabularEditorPath
  ↓
T012: runTabularEditor (depends on T011)
  ↓
T013: evaluateRulesWithTabularEditor (depends on T010, T012)
```

---

## Parallel Example: User Stories

```
# After Phase 2 completes:

US1 (Phase 3): T014 → T015 → T016 → T017 → T018
US2 (Phase 4): T019 → T020                         ← parallel with US1
US4 (Phase 6): T024 → T025 → T026                  ← parallel with US1

# After US1 completes:
US3 (Phase 5): T021 → T022 → T023
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (env vars)
2. Complete Phase 2: Foundational (TE service + tests)
3. Complete Phase 3: US1 (swap evaluation engine, remove DAX code)
4. **STOP and VALIDATE**: Run analysis against a live PBI model, verify all 71 rules evaluated
5. Deploy/demo if ready — this alone delivers the core value

### Incremental Delivery

1. Setup + Foundational → TE service ready
2. Add US1 → Full BPA evaluation works → **MVP delivered**
3. Add US2 → Path validation errors are clear → Config safety
4. Add US3 → Recheck works with TE → Feature parity
5. Add US4 → All failure modes handled gracefully → Production-ready
6. Polish → Clean code, all tests green, quickstart validated

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are written first (TDD per constitution Principle IV)
- Commit after each task or logical group
- Total files changed: 4 (1 new service, 1 new test, 1 modified service, 1 modified test, 1 deleted data file, 2 env files)
