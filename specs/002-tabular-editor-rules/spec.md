# Feature Specification: Tabular Editor Rules Engine

**Feature Branch**: `002-tabular-editor-rules`  
**Created**: 2026-02-23  
**Status**: Draft  
**Input**: User description: "Rework backend rules evaluation to use Tabular Editor 2 executable for evaluating BPA rule C# expressions, configurable via environment variable"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Full BPA Rule Evaluation via Tabular Editor (Priority: P1)

As a Power BI model analyst, I want the system to evaluate all BPA rules (including their native C# expressions) against my connected model so that I get comprehensive, accurate analysis results — not just the subset of rules that had manually-translated DAX queries.

Currently, the system translates a small subset of BPA rules into DAX queries and executes them via the Power BI MCP server. Many rules cannot be evaluated because their C# expressions (e.g., `DataType = "Double"`, `IsAvailableInMDX and (IsHidden or Table.IsHidden)`) have no DAX equivalent. By invoking Tabular Editor 2's CLI — which natively understands these expressions — the system can evaluate the full rule set.

**Why this priority**: This is the core value of the feature. Without Tabular Editor integration, most BPA rules remain unevaluable and the analysis is incomplete.

**Independent Test**: Can be fully tested by connecting to a Power BI model, running an analysis, and verifying that findings are returned for rules that previously had no DAX query coverage (e.g., `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`, `SNOWFLAKE_SCHEMA_ARCHITECTURE`).

**Acceptance Scenarios**:

1. **Given** a user has connected to a Power BI model and Tabular Editor executable path is configured, **When** the user triggers an analysis run, **Then** the system evaluates all applicable BPA rules using Tabular Editor and stores findings in the database with rule ID, affected object, severity, and category.
2. **Given** a user triggers an analysis, **When** Tabular Editor evaluates a rule and finds violations, **Then** each violation is recorded as a finding with the correct affected object name and object type.
3. **Given** a user triggers an analysis, **When** Tabular Editor evaluates a rule and finds no violations, **Then** no findings are recorded for that rule.

---

### User Story 2 - Configurable Tabular Editor Path (Priority: P1)

As a system administrator or developer, I want to configure the Tabular Editor executable location via an environment variable so that I can deploy the application in different environments without code changes.

**Why this priority**: Equal to P1 because the integration cannot function without a configurable path. Different users will have Tabular Editor installed in different locations. Hardcoding a path would make the system unusable for anyone with a different setup.

**Independent Test**: Can be tested by setting the environment variable to a valid Tabular Editor path and verifying the system uses it, then setting it to an invalid path and confirming appropriate error messaging.

**Acceptance Scenarios**:

1. **Given** the environment variable for Tabular Editor path is set to a valid executable, **When** the system starts, **Then** it recognizes the configured path and uses it for rule evaluation.
2. **Given** the environment variable is set to a path where the executable does not exist, **When** an analysis is triggered, **Then** the system returns a clear error indicating the Tabular Editor executable was not found at the configured path.
3. **Given** the environment variable is not set, **When** an analysis is triggered, **Then** the system returns a clear error indicating that the Tabular Editor path must be configured.

---

### User Story 3 - Recheck Individual Finding with Tabular Editor (Priority: P2)

As an analyst, after applying a fix to my model, I want to recheck a specific finding to verify the fix resolved the issue, using the same Tabular Editor evaluation engine that originally detected it.

**Why this priority**: Rechecking findings is an existing capability in the system. It must continue to work correctly with the new evaluation engine to maintain feature parity.

**Independent Test**: Can be tested by running an analysis, applying a model fix for a specific finding, then rechecking that finding and verifying it is marked as resolved.

**Acceptance Scenarios**:

1. **Given** a finding was previously detected by Tabular Editor, **When** the user requests a recheck of that finding after fixing the model, **Then** the system re-evaluates that specific rule and updates the finding status to FIXED if the violation is no longer present.
2. **Given** a finding was previously detected, **When** the user requests a recheck but the violation still exists, **Then** the finding status remains UNFIXED.

---

### User Story 4 - Graceful Degradation on Tabular Editor Failure (Priority: P2)

As a user, if Tabular Editor encounters an error during analysis (e.g., executable crashes, timeout, permission issue), I want clear feedback about what went wrong rather than a silent failure or cryptic error.

**Why this priority**: Robustness is important but secondary to core functionality. Users need actionable feedback when things go wrong.

**Independent Test**: Can be tested by misconfiguring the Tabular Editor path or simulating a process timeout and verifying the error is reported clearly.

**Acceptance Scenarios**:

1. **Given** Tabular Editor executable crashes during analysis, **When** the system detects the failure, **Then** the analysis run is marked as FAILED with a meaningful error message.
2. **Given** Tabular Editor takes longer than the configured timeout, **When** the timeout is exceeded, **Then** the process is terminated and the analysis is marked as FAILED with a timeout-specific message.
3. **Given** the Tabular Editor executable lacks execution permissions, **When** analysis is triggered, **Then** the system reports a permission error.

---

### Edge Cases

- What happens when the connected model's server address format is incompatible with Tabular Editor's expected connection string format?
- How does the system handle BPA rules whose `Scope` targets object types not present in the current model (e.g., rules scoped to `CalculatedTable` when the model has none)?
- What happens when Tabular Editor produces output in an unexpected format or an empty result?
- How does the system behave when multiple analysis runs are triggered concurrently against the same model?
- What happens when the BPA rules JSON file contains rules with malformed expressions?
- How does the system handle very large models where Tabular Editor evaluation takes significantly longer?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST invoke Tabular Editor 2 CLI to evaluate BPA rules against a connected Power BI model.
- **FR-002**: System MUST read the Tabular Editor executable path from an environment variable (e.g., `TABULAR_EDITOR_PATH`).
- **FR-003**: System MUST pass the connected model's server address and database name to Tabular Editor for evaluation.
- **FR-004**: System MUST pass the BPA rules definition file to Tabular Editor for evaluation.
- **FR-005**: System MUST parse Tabular Editor's output to extract individual rule violations, including the rule ID, affected object name, object type, and severity.
- **FR-006**: System MUST store each detected violation as a finding in the database, consistent with the existing finding data model (rule ID, rule name, category, severity, description, affected object, object type, auto-fix availability).
- **FR-007**: System MUST validate that the configured Tabular Editor executable exists and is accessible before attempting evaluation.
- **FR-008**: System MUST terminate the Tabular Editor process if it exceeds a reasonable timeout threshold to prevent hung processes.
- **FR-009**: System MUST mark the analysis run as FAILED with a descriptive error when Tabular Editor evaluation fails for any reason (crash, timeout, missing executable, permission error).
- **FR-010**: System MUST support rechecking individual findings by re-running the relevant rule evaluation via Tabular Editor.
- **FR-011**: System MUST preserve all existing analysis run lifecycle behavior (status transitions: RUNNING → COMPLETED/FAILED, summary counts for errors/warnings/info).
- **FR-012**: System MUST replace the current DAX-query-based rule evaluation with Tabular Editor-based evaluation as the primary evaluation engine.

### Key Entities

- **BPA Rule**: A best practice rule with an ID, name, category, severity, scope, C# expression, and optional fix expression. Sourced from the existing BPA rules data file.
- **Finding**: A detected violation of a BPA rule against a specific object in the model. Linked to an analysis run. Contains rule metadata, affected object identification, and fix status.
- **Analysis Run**: A single execution of rule evaluation against a connected model. Tracks status, timing, and aggregate counts.
- **Tabular Editor Configuration**: The executable path and any additional settings needed to invoke Tabular Editor CLI.

## Assumptions

- Tabular Editor 2 CLI supports a mode to evaluate BPA rules against a connected model via command-line arguments (server address, database name, rules file path) and outputs results in a parseable format (JSON or structured text).
- The existing BPA rules JSON file format is compatible with (or can be transformed to) the format Tabular Editor expects for its Best Practice Analyzer rules input.
- Tabular Editor 2 can connect to the same Power BI / Analysis Services instances that the current MCP server connects to, using the same server address and database name.
- A reasonable process timeout of 120 seconds is sufficient for most model evaluations; very large models may require configuration.
- The Tabular Editor executable does not require a GUI or display server to run in CLI mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Analysis runs evaluate 100% of applicable BPA rules (all rules whose scope matches objects in the model), compared to the current partial coverage via DAX queries.
- **SC-002**: Users can complete a full analysis run (trigger → results displayed) within 2 minutes for typical models (under 100 tables).
- **SC-003**: All findings produced by Tabular Editor are correctly persisted and visible in the existing findings UI without modification.
- **SC-004**: Configuration of the Tabular Editor path requires only setting a single environment variable — no code changes or redeployment.
- **SC-005**: When Tabular Editor is unavailable or misconfigured, 100% of failure cases produce a user-understandable error message within 10 seconds.
- **SC-006**: Rechecking a fixed finding correctly reflects the updated model state (finding transitions from UNFIXED to FIXED).
