<!--
  Sync Impact Report
  ==================
  Version change: N/A → 1.0.0 (initial ratification)
  Modified principles: N/A (initial version)
  Added sections:
    - Core Principles (6 principles)
    - Code Quality Standards
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no updates needed (dynamic reference)
    - .specify/templates/spec-template.md ✅ no updates needed (generic template)
    - .specify/templates/tasks-template.md ✅ no updates needed (generic template)
    - .specify/templates/checklist-template.md ✅ no updates needed (generic template)
    - .specify/templates/agent-file-template.md ✅ no updates needed (generic template)
  Follow-up TODOs: none
-->

# Copilot SDK Challenge Constitution

## Core Principles

### I. Simplicity & Anti-Abstraction (NON-NEGOTIABLE)

- Every solution MUST use the most direct implementation that
  satisfies the requirement. No speculative generalization.
- Abstractions (interfaces, base classes, wrappers) MUST NOT be
  introduced until at least two concrete, distinct consumers exist.
- YAGNI (You Aren't Gonna Need It): features, parameters, or
  extension points MUST NOT be added "just in case."
- When choosing between a clever/generic approach and a
  straightforward/specific one, the straightforward option MUST win
  unless the clever approach is measurably simpler to understand.
- Rationale: Premature abstraction increases cognitive load, hides
  bugs, and slows iteration. Simplicity is a feature.

### II. Clean Code

- Functions MUST do one thing, be short (ideally < 30 lines), and
  have descriptive names that reveal intent.
- Variable and function names MUST be self-documenting; avoid
  abbreviations unless universally understood (e.g., `id`, `url`).
- Magic numbers and strings MUST be extracted to named constants.
- Comments MUST explain *why*, never *what*—the code itself MUST
  convey the *what*.
- Dead code, commented-out code, and TODO comments without linked
  issues MUST be removed before merge.
- Rationale: Readable code reduces onboarding time, review effort,
  and defect rates.

### III. Separation of Concerns

- Each module, class, or file MUST have a single, clearly stated
  responsibility.
- Business logic MUST NOT be mixed with I/O, presentation, or
  infrastructure concerns.
- Dependencies between modules MUST flow in one direction; circular
  dependencies are prohibited.
- Data transfer between layers MUST use explicit contracts (typed
  objects or interfaces), not raw dictionaries or untyped maps.
- Rationale: Clear boundaries make code independently testable,
  replaceable, and comprehensible.

### IV. Unit Testing (NON-NEGOTIABLE)

- Every public function or method with non-trivial logic MUST have
  corresponding unit tests.
- Unit tests MUST be fast (< 200 ms each), isolated (no network,
  filesystem, or database), and deterministic.
- Test names MUST describe the scenario and expected outcome
  (e.g., `test_parse_returns_error_on_empty_input`).
- New code MUST NOT decrease overall test coverage. Coverage
  regressions block merge.
- Edge cases, boundary values, and error paths MUST be tested
  explicitly—not just the happy path.
- Rationale: Unit tests are the primary safety net; untested code
  is untrustworthy code.

### V. Observability & Logging

- All significant operations (entry points, external calls, state
  transitions, error conditions) MUST emit structured log entries.
- Log entries MUST include: timestamp, severity level, correlation
  ID (where applicable), and a human-readable message.
- Logs MUST use consistent severity levels: DEBUG for diagnostics,
  INFO for operational events, WARN for recoverable issues, ERROR
  for failures requiring attention.
- Sensitive data (tokens, passwords, PII) MUST NEVER appear in
  logs.
- Rationale: Without observable behavior, debugging production
  issues becomes guesswork. Logs are the first line of defense.

### VI. Versioning & Breaking Changes

- The project MUST follow Semantic Versioning (MAJOR.MINOR.PATCH):
  - MAJOR: backward-incompatible API or behavior changes.
  - MINOR: new functionality added in a backward-compatible manner.
  - PATCH: backward-compatible bug fixes and refinements.
- Every breaking change MUST be documented in a changelog entry
  with migration instructions before merge.
- Public API signatures MUST NOT be removed or renamed without a
  deprecation period of at least one minor release.
- Breaking changes MUST be justified by a concrete, documented
  benefit that outweighs the migration cost.
- Rationale: Predictable versioning protects consumers and builds
  trust in the project's stability.

## Code Quality Standards

- All code MUST pass linting and formatting checks before merge.
- Functions with more than 3 parameters SHOULD be refactored to
  accept a configuration/options object.
- Cyclomatic complexity per function MUST NOT exceed 10.
- No file SHOULD exceed 300 lines; split into focused modules when
  approaching this limit.
- Error handling MUST be explicit—never swallow exceptions silently.
  Every catch block MUST log or re-throw.

## Development Workflow

- Every change MUST be submitted via pull request with at least one
  reviewer approval.
- Pull requests MUST include: a clear description of *what* and
  *why*, linked issue/task, and passing CI checks (lint, test,
  build).
- Commits MUST follow Conventional Commits format
  (`type(scope): description`) to support automated changelog
  generation.
- Feature branches MUST be short-lived (< 5 days) and rebased
  against main before merge.
- CI pipeline MUST enforce: lint, unit tests, build, and coverage
  threshold gates.

## Governance

- This constitution supersedes all other coding practices and
  guidelines within the project. In case of conflict, the
  constitution wins.
- Amendments require: (1) a pull request modifying this file,
  (2) documented rationale for the change, (3) version bump per
  Semantic Versioning rules below, and (4) approval from at
  least one project maintainer.
- Version policy for this constitution:
  - MAJOR: Removal or redefinition of a core principle.
  - MINOR: Addition of a new principle or material expansion of
    existing guidance.
  - PATCH: Clarifications, wording improvements, typo fixes.
- All pull requests and code reviews MUST verify compliance with
  these principles. Non-compliance MUST be flagged and resolved
  before merge.
- Complexity that violates Principle I (Simplicity) MUST be
  explicitly justified in the PR description with a rationale for
  why the simpler alternative is insufficient.

**Version**: 1.0.0 | **Ratified**: 2026-02-20 | **Last Amended**: 2026-02-20
