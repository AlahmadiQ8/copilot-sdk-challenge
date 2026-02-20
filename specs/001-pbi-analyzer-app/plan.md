# Implementation Plan: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Branch**: `001-pbi-analyzer-app` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-pbi-analyzer-app/spec.md`

## Summary

A web application that connects to Power BI Semantic Models via the Power BI Modeling MCP server, runs best-practice analysis using community BPA rules, and provides AI-powered auto-fix capabilities through the GitHub Copilot SDK. Includes a DAX query generation/testing tab powered by the same Copilot SDK + MCP integration. Backend uses Express.js (TypeScript) with Prisma ORM + SQLite for persistence; frontend uses React + Tailwind CSS.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+)  
**Primary Dependencies**:  
- **Frontend**: React 18+, Tailwind CSS, React Router, Monaco Editor (DAX editor)  
- **Backend**: Express.js, Prisma ORM, @github/copilot-sdk, @modelcontextprotocol/sdk (MCP client)  
- **External**: Power BI Modeling MCP Server (stdio), BPA Rules JSON from GitHub  
**Storage**: SQLite via Prisma ORM (findings, analysis runs, agent sessions)  
**Testing**: Vitest (unit), Playwright (UI/E2E with configurable mock API)  
**Target Platform**: Desktop/laptop browsers (Chrome, Edge, Firefox, Safari latest 2 versions), Windows/macOS/Linux server  
**Project Type**: Web application (frontend + backend)  
**Performance Goals**: Analysis results within 30s for models with up to 100 objects; AI fix within 60s per finding; DAX query results within 10s  
**Constraints**: Minimum viewport 1024px; WCAG 2.1 AA accessibility; Power BI Desktop must be running locally with MCP server  
**Scale/Scope**: Single-user local tool (1 user, 1 semantic model at a time), ~6 screens/views

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check (Phase 0 gate) — ALL PASS

### I. Simplicity & Anti-Abstraction — PASS
- Direct implementation: MCP client calls Power BI Modeling MCP server directly; no middleware abstraction layers.
- Copilot SDK used as-is for AI agent sessions — no custom orchestration wrapper.
- BPA rules fetched and evaluated directly — no rules engine abstraction until needed.

### II. Clean Code — PASS (enforced at implementation)
- Functions < 30 lines, descriptive names, no magic strings.
- Constants for BPA rule categories, severity levels, API routes.

### III. Separation of Concerns — PASS
- Frontend: React components (UI) → services (API calls) → types (contracts).
- Backend: Routes (API) → services (business logic) → models (Prisma) → MCP client (integration).
- No circular dependencies; one-directional flow.

### IV. Unit Testing — PASS (enforced at implementation)
- Vitest for backend services and frontend logic.
- Playwright for UI tests with configurable mock API responses.
- Coverage gates enforced in CI.

### V. Observability & Logging — PASS (enforced at implementation)
- Structured logging with correlation IDs for analysis runs and fix sessions.
- No sensitive data (tokens, PII) in logs.

### VI. Versioning & Breaking Changes — PASS
- SemVer for the application. Conventional commits enforced.

### Post-Design Re-Check (Phase 1 gate) — ALL PASS

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | PASS | No unnecessary abstractions in data model or API. Prisma schema has 5 models — each maps directly to a spec entity. API endpoints map 1:1 to user actions. No repository pattern, no service interfaces — direct Prisma calls in services. |
| II. Clean Code | PASS | API contract uses consistent naming, typed schemas, standard REST patterns. Status enums are string literals (not separate tables). |
| III. Separation of Concerns | PASS | Clear layers: routes → services → Prisma/MCP. Frontend types mirror API schemas. SSE endpoint for real-time fix progress separates push from pull. |
| IV. Unit Testing | PASS | Data model designed for testability: services can be tested with mocked Prisma client and MCP client. Playwright tests use configurable mock API. |
| V. Observability | PASS | AnalysisRun.id and FixSession.id serve as correlation IDs. FixSessionStep captures full agent trace for inspection and debugging. |
| VI. Versioning | PASS | API versioned at `/api/` prefix. Schema migrations managed by Prisma. |

## Project Structure

### Documentation (this feature)

```text
specs/001-pbi-analyzer-app/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── routes/          # Express route handlers (analyzer, dax, sessions)
│   ├── services/        # Business logic (analysis, ai-fix, dax-query, mcp-client)
│   ├── models/          # Prisma client re-exports, type definitions
│   ├── mcp/             # MCP client setup and Power BI Modeling MCP integration
│   └── index.ts         # Express app entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/
│   ├── unit/            # Service-level unit tests (Vitest)
│   └── integration/     # API route integration tests (Vitest + supertest)
├── package.json
└── tsconfig.json

frontend/
├── src/
│   ├── components/      # Reusable UI components (FindingCard, SessionLog, QueryEditor, etc.)
│   ├── pages/           # Route-level pages (AnalyzerPage, DaxQueryPage)
│   ├── services/        # API client functions (fetch wrappers)
│   ├── hooks/           # Custom React hooks
│   ├── types/           # Shared TypeScript types/interfaces
│   └── App.tsx          # Root component with routing
├── tests/
│   ├── unit/            # Component unit tests (Vitest + React Testing Library)
│   └── e2e/             # Playwright E2E tests with configurable mock API
├── package.json
└── tsconfig.json
```

**Structure Decision**: Web application with separate `frontend/` and `backend/` directories. Frontend is a React SPA served independently during development (Vite dev server) and can be built as static assets for production. Backend is an Express.js API server that manages MCP connections, Copilot SDK sessions, and Prisma database operations.

## Complexity Tracking

> No constitution violations detected. All design decisions follow the simplest viable approach.
