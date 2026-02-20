# Feature Specification: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Feature Branch**: `001-pbi-analyzer-app`  
**Created**: 2026-02-20  
**Status**: Draft  
**Input**: User description: "I want to build a web app that connects to your Power BI Semantic Model and analyze for best practices to get a result of findings where each one can be auto fixed via AI agent. User can trigger AI fix for each individual finding and rerun the analyzer to see if it's fixed or not. For each auto fix for a finding, the user can inspect the agent session as well. There should also be another tab where they can generate and test DAX queries. The app should be user friendly and follows UX best practices"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect & Analyze Semantic Model (Priority: P1)

A Power BI developer opens the web app and connects to their Power BI Semantic Model. The app runs a best practices analysis against the model and presents a categorized list of findings. Each finding shows a severity level, a description of the issue, and the affected object in the model. The user can quickly scan the results to understand the overall health of their model.

**Why this priority**: This is the foundational capability — without connecting to a model and surfacing findings, no other features (AI fix, DAX queries) have value. It delivers immediate insight on its own.

**Independent Test**: Can be fully tested by connecting to a sample Semantic Model, running the analyzer, and verifying that known best-practice violations appear in the results list with correct severity, description, and affected object.

**Acceptance Scenarios**:

1. **Given** the user is on the app home page, **When** they provide their Power BI Semantic Model connection details and initiate analysis, **Then** the system connects to the model and displays a loading indicator while analysis runs.
2. **Given** analysis is in progress, **When** the analysis completes, **Then** a list of findings is displayed, each showing severity (e.g., Error, Warning, Info), a human-readable description, the category (e.g., Performance, Naming, DAX Patterns), and the affected model object (table, column, measure, etc.).
3. **Given** findings are displayed, **When** the user views the results, **Then** findings are grouped or filterable by category and sortable by severity, and a summary count (e.g., "3 Errors, 12 Warnings, 5 Info") is shown.
4. **Given** the model has no best-practice violations, **When** analysis completes, **Then** the app displays a congratulatory message indicating the model passes all checks.

---

### User Story 2 - AI Auto-Fix Individual Findings (Priority: P2)

After reviewing the analysis results, the user selects a specific finding and triggers an AI-powered auto-fix. The AI agent applies a corrective change to the Semantic Model to resolve the finding. The user can see progress and status of the fix operation.

**Why this priority**: Auto-fix is the core value differentiator — it turns passive analysis into actionable remediation, allowing users to fix issues without deep expertise. It depends on the analysis results from P1 but delivers standalone value for each individual finding.

**Independent Test**: Can be fully tested by selecting a known fixable finding, triggering the AI fix, and verifying the model is updated accordingly. The fix should be observable by inspecting the model or re-running analysis.

**Acceptance Scenarios**:

1. **Given** the analyzer has returned findings, **When** the user clicks the "AI Fix" action on a specific finding, **Then** the system initiates the AI agent to process and apply a fix for that finding, showing a progress indicator.
2. **Given** an AI fix is in progress, **When** the fix completes successfully, **Then** the finding's status updates to "Fixed" and the user receives a confirmation message describing what was changed.
3. **Given** an AI fix is in progress, **When** the fix fails or cannot be applied, **Then** the finding's status updates to "Fix Failed" and the user receives an explanation of why the fix could not be applied.
4. **Given** a finding has been fixed, **When** the user views the finding, **Then** the applied change is summarized in plain language (e.g., "Renamed column 'Amt' to 'Amount' in table 'Sales'").

---

### User Story 3 - Rerun Analyzer After Fixes (Priority: P3)

After applying one or more AI fixes, the user reruns the best practices analyzer against the same Semantic Model to verify that findings have been resolved. The updated results clearly show which findings are now resolved and which remain.

**Why this priority**: Verification closes the feedback loop — users need to confirm fixes actually work. This depends on P1 (analysis) and P2 (fix) but is essential for user confidence.

**Independent Test**: Can be fully tested by applying a fix to a finding, rerunning the analyzer, and verifying the previously flagged finding no longer appears in the results (or appears as resolved).

**Acceptance Scenarios**:

1. **Given** one or more findings have been fixed, **When** the user clicks "Rerun Analysis," **Then** the analyzer reruns against the current state of the Semantic Model and refreshes the findings list.
2. **Given** a rerun completes, **When** a previously flagged finding is now resolved, **Then** it no longer appears in the active findings list (or is marked as "Resolved" in a history view).
3. **Given** a rerun completes, **When** some findings remain unresolved, **Then** those findings are still visible with their original severity and details.

---

### User Story 4 - Inspect AI Agent Session (Priority: P4)

For any finding that was auto-fixed, the user can inspect the AI agent session to see the step-by-step reasoning, actions taken, and changes made by the AI agent. This provides transparency and builds trust.

**Why this priority**: Transparency is important for trust and auditability, but the feature works without it. It enhances the P2 experience without being required for core functionality.

**Independent Test**: Can be fully tested by triggering an AI fix, then opening the agent session inspector and verifying the session log shows the reasoning steps, actions, and model changes made.

**Acceptance Scenarios**:

1. **Given** an AI fix has been applied (successfully or not), **When** the user clicks "Inspect Session" on that finding, **Then** a detail panel or modal opens showing the full agent session log.
2. **Given** the agent session inspector is open, **When** the user reads the session, **Then** they can see each step the agent took including: the analysis of the problem, the proposed fix, the actions executed, and the outcome.
3. **Given** the agent session inspector is open, **When** the user scrolls through the session, **Then** timestamps are shown for each step and the total duration is displayed.

---

### User Story 5 - Generate & Test DAX Queries (Priority: P5)

On a separate tab, the user can write or generate DAX queries against the connected Semantic Model, execute them, and view the results. This provides a convenient workspace for ad-hoc DAX authoring and validation.

**Why this priority**: This is an adjacent but valuable feature that leverages the existing model connection. It operates independently from the analyzer flow and provides standalone value for DAX development.

**Independent Test**: Can be fully tested by navigating to the DAX tab, entering a DAX query (e.g., `EVALUATE 'Sales'`), executing it, and verifying the query results are displayed correctly in a tabular format.

**Acceptance Scenarios**:

1. **Given** the user has a connected Semantic Model, **When** they navigate to the "DAX Query" tab, **Then** a query editor is displayed with syntax highlighting and the ability to enter DAX expressions.
2. **Given** the user has entered a valid DAX query, **When** they click "Run Query," **Then** the query executes against the connected model and results are displayed in a tabular format below the editor.
3. **Given** the user has entered an invalid DAX query, **When** they click "Run Query," **Then** a clear error message is displayed indicating the nature of the DAX syntax or evaluation error.
4. **Given** query results are displayed, **When** the user views the results, **Then** the results table supports scrolling, column resizing, and shows row count and execution time.

---

### User Story 6 - User-Friendly Navigation & Layout (Priority: P6)

The web app provides a clean, intuitive interface with two main tabs — "Analyzer" and "DAX Queries" — along with clear navigation, responsive layout, status feedback, and accessibility. The design follows established UX best practices for data tooling.

**Why this priority**: Good UX is essential but is a cross-cutting concern that enhances all other stories rather than delivering independent functionality.

**Independent Test**: Can be fully tested by navigating through all tabs and features, verifying responsive behavior at different viewport sizes, checking keyboard navigation, and confirming all interactive elements provide appropriate feedback.

**Acceptance Scenarios**:

1. **Given** the user opens the app, **When** the home page loads, **Then** the interface displays a clear layout with two main tabs ("Analyzer" and "DAX Queries"), a connection status area, and intuitive visual hierarchy.
2. **Given** the user is on any tab, **When** they perform an action, **Then** all operations provide immediate visual feedback (loading spinners, success/error toasts, progress indicators).
3. **Given** the user is on any page, **When** they resize the browser window, **Then** the layout adapts responsively and remains usable on screens as small as 1024px wide.
4. **Given** the user navigates the app, **When** they use keyboard-only navigation, **Then** all interactive elements are accessible via keyboard with visible focus indicators.

---

### Edge Cases

- What happens when the Power BI Semantic Model connection is lost mid-analysis? The app should display a clear connection error and allow the user to reconnect without losing their current session context.
- What happens when the AI agent attempts a fix but the user's permissions on the Semantic Model are insufficient? The app should display a permissions error explaining what access is required.
- What happens when multiple findings are being fixed simultaneously? Each fix should operate independently, and the UI should show individual progress for each.
- How does the system handle very large models with hundreds of findings? The findings list should use pagination or virtual scrolling to remain performant.
- What happens when a DAX query takes too long to execute? The app should show a timeout message and allow the user to cancel the running query.
- What happens when the user tries to fix a finding that has already been resolved? The app should indicate the finding is already resolved and suggest rerunning analysis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to provide Power BI Semantic Model connection details and establish a connection.
- **FR-002**: System MUST run a comprehensive best practices analysis against the connected Semantic Model, covering categories such as performance, naming conventions, DAX patterns, relationships, and data modeling.
- **FR-003**: System MUST display analysis findings in a structured list with severity level (Error, Warning, Info), category, description, and affected model object.
- **FR-004**: System MUST provide filtering and sorting capabilities on the findings list (by severity, category, status).
- **FR-005**: System MUST display a summary of findings (count by severity) at the top of the results.
- **FR-006**: System MUST allow users to trigger an AI-powered auto-fix for each individual finding via a clearly labeled action button.
- **FR-007**: System MUST show real-time progress and status updates while an AI fix is in progress.
- **FR-008**: System MUST update the finding status after a fix attempt (Fixed, Fix Failed) and display a summary of changes made.
- **FR-009**: System MUST allow users to rerun the full best practices analysis at any time to verify fixes.
- **FR-010**: System MUST provide an "Inspect Session" action for each finding that has had an AI fix attempted, showing the full agent session log with step-by-step reasoning, actions, and outcomes.
- **FR-011**: System MUST provide a separate "DAX Queries" tab with a query editor that supports DAX syntax highlighting.
- **FR-012**: System MUST execute user-entered DAX queries against the connected Semantic Model and display results in a tabular format.
- **FR-013**: System MUST display clear error messages for invalid DAX queries, connection failures, permission errors, and fix failures.
- **FR-014**: System MUST provide a responsive layout that works on screens 1024px wide and above.
- **FR-015**: System MUST support keyboard navigation and provide visible focus indicators for all interactive elements.
- **FR-016**: System MUST provide visual feedback for all user-initiated actions (loading states, success confirmations, error alerts).
- **FR-017**: System MUST handle connection loss gracefully, allowing users to reconnect without losing their session context (applied fixes, query history).

### Key Entities

- **Semantic Model Connection**: Represents the active connection to a user's Power BI Semantic Model. Key attributes: connection status, model name, workspace name, last connected timestamp.
- **Finding**: An individual best-practice violation or recommendation identified during analysis. Key attributes: unique identifier, severity, category, description, affected object (table/column/measure/relationship), fix status (Unfixed, In Progress, Fixed, Fix Failed).
- **AI Fix Session**: A record of an AI agent's attempt to fix a specific finding. Key attributes: finding reference, session start/end timestamps, step-by-step log (reasoning, actions, outcomes), overall result (success/failure).
- **Analysis Run**: Represents a single execution of the best practices analyzer. Key attributes: run timestamp, total findings count by severity, associated Semantic Model.
- **DAX Query**: A user-authored DAX query for execution. Key attributes: query text, execution status, execution time, result data, error message (if any).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect to a Semantic Model and view best practices findings within 30 seconds of initiating analysis (for models with up to 100 objects).
- **SC-002**: Users can trigger an AI fix for a finding with a single click and receive a fix result within 60 seconds per finding.
- **SC-003**: 90% of users can successfully navigate from connection to viewing findings to triggering a fix without external guidance on first use.
- **SC-004**: Users can rerun analysis and verify fix results within 15 seconds of initiating a rerun.
- **SC-005**: Users can execute a DAX query and view results within 10 seconds for standard queries.
- **SC-006**: Agent session inspection provides enough detail for users to understand what changes were made, with at least 3 distinct information steps (problem analysis, proposed fix, applied change) visible per session.
- **SC-007**: The app is fully usable via keyboard navigation and meets WCAG 2.1 AA accessibility standards.
- **SC-008**: The app layout remains fully functional and readable on viewports from 1024px to 2560px wide.

## Assumptions

- The user has valid credentials and appropriate permissions to access and modify the target Power BI Semantic Model.
- The best practices rules are pre-defined and maintained as part of the application (e.g., based on community-recognized Power BI best practices such as those from BPA Analyzer / Tabular Editor rules).
- The AI agent has write access to modify the Semantic Model to apply fixes (via the same connection/credentials the user provides).
- The DAX query tab executes queries in read-only mode against the model data; it does not modify the model structure.
- The application is designed for desktop/laptop browser use; mobile support is out of scope.
- The application supports modern browsers (latest two major versions of Chrome, Edge, Firefox, Safari).
