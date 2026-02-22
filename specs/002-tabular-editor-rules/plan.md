# Implementation Plan: Tabular Editor Rules Engine

**Branch**: `002-tabular-editor-rules` | **Date**: 2026-02-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-tabular-editor-rules/spec.md`

## Summary

Replace the current partial DAX-query-based BPA rule evaluation with Tabular Editor 2 CLI integration. The backend invokes `TabularEditor.exe` as a child process, passing the connected model's server address, database name, and the BPA rules JSON file. Tabular Editor natively evaluates all rule C# expressions and outputs violations in a parseable format (console text + optional TRX XML). The executable path is configured via the `TABULAR_EDITOR_PATH` environment variable.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+)
**Primary Dependencies**: Express.js, Prisma ORM, `child_process` (Node.js built-in), existing MCP client
**Storage**: SQLite via Prisma ORM (existing — no schema changes)
**Testing**: Vitest (unit)
**Target Platform**: Windows (Tabular Editor 2 is Windows-only; requires .NET Framework 4.8)
**Project Type**: Web application (backend-only changes)
**Performance Goals**: Full BPA analysis within 120 seconds for typical models (< 100 tables)
**Constraints**: Tabular Editor 2 is Windows-only; executable must be pre-installed and path configured
**Scale/Scope**: Single-user local tool, backend service changes only (~3 files modified/created)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check (Phase 0 gate) — ALL PASS

### I. Simplicity & Anti-Abstraction — PASS
- Direct implementation: Node.js `child_process.execFile` invokes Tabular Editor CLI. No abstraction layers, no wrapper classes.
- Output parsed line-by-line with a single regex. No rules engine, no expression evaluator.
- Replaces the complex DAX-query translation approach with a simpler "call the tool that already knows how to do it" approach.

### II. Clean Code — PASS (enforced at implementation)
- New service function `evaluateRulesWithTabularEditor()` replaces `evaluateRules()`.
- Constants for env var name, timeout, regex patterns.
- Functions < 30 lines each.

### III. Separation of Concerns — PASS
- `tabular-editor.service.ts`: Tabular Editor process management and output parsing.
- `analysis.service.ts`: Analysis orchestration (unchanged interface, swaps evaluation engine).
- No circular dependencies; one-directional flow preserved.

### IV. Unit Testing — PASS (enforced at implementation)
- Output parser tested with mock Tabular Editor console output strings.
- Process invocation tested with mocked `child_process`.
- Error scenarios (timeout, crash, bad path) tested explicitly.

### V. Observability & Logging — PASS (enforced at implementation)
- Structured logs for: process spawn, process exit code, finding count, parse errors, timeouts.
- No sensitive data in logs.

### VI. Versioning & Breaking Changes — PASS
- Internal refactor: API contract unchanged. No breaking changes to frontend or API consumers.
- New env var `TABULAR_EDITOR_PATH` is additive configuration.

## Project Structure

### Documentation (this feature)

```text
specs/002-tabular-editor-rules/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── services/
│   │   ├── analysis.service.ts      # Modified: swap evaluateRules → evaluateRulesWithTE
│   │   ├── tabular-editor.service.ts # New: TE CLI invocation, output parsing
│   │   └── rules.service.ts         # Existing: BPA rules loading (unchanged)
│   └── ...
├── tests/
│   └── unit/
│       ├── tabular-editor.service.test.ts  # New: parser + process tests
│       └── analysis.service.test.ts        # Modified: updated mocks
└── .env                                    # Add TABULAR_EDITOR_PATH
```

**Structure Decision**: Backend-only changes within the existing web application structure. One new service file (`tabular-editor.service.ts`) and one new test file. Existing `analysis.service.ts` modified to call the new service. No frontend changes required — the API contract is unchanged.

## Post-Design Constitution Re-Check (Phase 1 gate)

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity & Anti-Abstraction | **PASS** | Single `execFile` call + regex parser. No abstractions, no wrappers, no generalization. Removes the more complex DAX-translation layer. |
| II. Clean Code | **PASS** | New service has 3 focused functions: `runTabularEditor()` (process), `parseConsoleOutput()` (parser), `buildRuleLookupMap()` (data). Each < 30 lines. Named constants for regex, timeout, env var. |
| III. Separation of Concerns | **PASS** | `tabular-editor.service.ts` owns CLI + parsing. `analysis.service.ts` owns orchestration. One-directional flow preserved. No data model changes, no API changes. |
| IV. Unit Testing | **PASS** | Parser tested with real console output samples. Process invocation tested with mocked `child_process`. Error paths (timeout, crash, bad path) tested explicitly. All tests fast and isolated. |
| V. Observability & Logging | **PASS** | Structured logs for: process spawn (INFO), exit code (INFO/ERROR), finding count (INFO), parse errors (WARN), timeouts (ERROR). No sensitive data. |
| VI. Versioning & Breaking Changes | **PASS** | Internal refactor — no API changes, no frontend changes, no breaking changes. New env var is additive. `dax-rule-queries.json` removal is internal cleanup. |

**Gate result**: ALL PASS — proceed to Phase 2.

## Complexity Tracking

> No constitution violations detected. This feature simplifies the codebase by removing the DAX-query translation layer (`dax-rule-queries.json` + DAX evaluation logic) and replacing it with a single CLI invocation.
