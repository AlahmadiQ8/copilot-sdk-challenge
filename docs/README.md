# Power BI Best Practices Analyzer & AI Auto-Fix

A full-stack web application that automates Power BI semantic model governance by combining the Tabular Editor 2 Best Practice Analyzer engine with AI-powered auto-fix capabilities through the GitHub Copilot SDK.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution](#solution)
3. [Prerequisites](#prerequisites)
4. [Setup Instructions](#setup-instructions)
5. [Deployment](#deployment)
6. [Architecture](#architecture)
7. [GitHub Copilot SDK Integration](#github-copilot-sdk-integration)
8. [Responsible AI (RAI) Notes](#responsible-ai-rai-notes)
9. [Project Structure](#project-structure)
10. [Testing](#testing)

---

## Problem Statement

A [popular community approach](https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Automate-Power-BI-Model-Optimization-Best-Practice-Analyzer/ba-p/5000187) describes using Tabular Editor's Best Practice Analyzer combined with Claude Desktop (via MCP) to optimize Power BI models. The workflow is effective — but it carries significant friction that limits adoption:

### The Manual Workflow Today

1. **Open Tabular Editor 2** → press F10 → run Best Practice Analyzer
2. **Copy violations** from the BPA window into a text editor → manually group into batches (formatting, DAX, performance, maintenance)
3. **Open Claude Desktop** → paste a batch of violations + a safety prompt → wait for the AI to process
4. **Review Claude's chat output** to understand what changed → manually validate in Power BI Desktop
5. **Repeat** for each batch → re-run BPA to verify → 45–60 minutes per model

### Why This Doesn't Scale

- **4+ tools, constant context-switching.** Tabular Editor → text editor → Claude Desktop → Power BI Desktop → repeat. Every cycle requires manual handoffs between disconnected applications.
- **Copy-paste driven.** Violations are transferred as raw text. No structured tracking, no status management, no way to pick up where you left off.
- **No programmatic safety rails.** The AI applies changes based on prompt instructions ("evaluate before applying"). Safety depends entirely on the user writing the right prompt — there's no enforced approval gate.
- **Not repeatable or shareable.** The workflow lives in one person's Claude conversation. No audit trail, no team access, no way to standardize across multiple models or analysts.
- **Tied to a specific AI provider.** Requires Claude Desktop — it's not embeddable, extensible, or enterprise-ready.

A real-world model can surface **200+ violations** across performance, DAX quality, formatting, and maintenance categories. Manually processing these across four tools is the bottleneck.

---

## Solution

This app replaces the multi-tool workflow with a single integrated web application powered by the GitHub Copilot SDK.

### Before vs. After

| Manual Workflow (Before) | This App (After) |
|---|---|
| Open Tabular Editor → press F10 → scan violations | Click **Run Analysis** — TE CLI evaluates all 71 rules automatically |
| Copy violations to text editor → group into batches | Findings displayed in a filterable, categorized dashboard |
| Paste into Claude Desktop → write safety prompts | Click **AI Fix** — Copilot SDK agent handles it with built-in approval |
| Read Claude's chat output to understand changes | Click **Inspect Session** — full step-by-step agent trace with tool calls |
| Switch to PBI Desktop → test manually → repeat | Click **Rerun Analysis** — instant verification in the same window |
| 45–60 minutes across 4+ tools | Single window, guided workflow, full audit trail |

### How It Works

1. **Connect** — Point the app at any Power BI Desktop instance with an open semantic model
2. **Analyze** — All 71 Best Practice Analyzer rules are evaluated via Tabular Editor 2's native C# expression engine
3. **Fix** — For each violation, trigger an AI agent (powered by GitHub Copilot SDK) that proposes and applies fixes with your approval
4. **Verify** — Rerun analysis to confirm violations are resolved
5. **Query** — Use the built-in DAX workspace to explore and validate your model

### Key Differentiators

- **Full BPA coverage** — 71 rules evaluated natively via Tabular Editor CLI, not a manual subset
- **Programmatic human-in-the-loop** — Every write operation requires explicit UI approval. Not prompt-based — enforced in code.
- **Full auditability** — Every AI agent session is persisted and inspectable: tool calls, parameters, reasoning, outcomes
- **Single integrated tool** — Detection → Fix → Verification in one window. No context switching.
- **GitHub Copilot SDK** — Enterprise-grade, embeddable AI. Not tied to any specific chat application.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | v18 or later |
| **Power BI Desktop** | With a semantic model open (the model you want to analyze) |
| **Power BI Modeling MCP Server** | VS Code extension `analysis-services.powerbi-modeling-mcp` or standalone executable |
| **GitHub Copilot** | Authenticated via `copilot --version` (required for AI fix features) |
| **Tabular Editor 2** | Bundled in repo at `TabularEditor.2.27.2/`, or provide a custom path |
| **Git** | For cloning the repository |
| **Windows** | Required for Tabular Editor 2 and Power BI Desktop connectivity |

---

## Setup Instructions

### Clone the Repository

```bash
git clone <repo-url>
cd copilot-sdk-challenge
```

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # Or create .env manually (see Environment Configuration below)
npx prisma migrate dev --name init
npm run dev             # Starts on http://localhost:3001
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev             # Starts on http://localhost:5173
```

### Environment Configuration

Create `backend/.env` with the following variables:

```env
DATABASE_URL="file:./prisma/dev.db"
PORT=3001
PBI_MCP_COMMAND=C:\\path\\to\\powerbi-modeling-mcp.exe
PBI_MCP_ARGS=--start
TABULAR_EDITOR_PATH=C:\\path\\to\\TabularEditor.exe
TABULAR_EDITOR_TIMEOUT=120000
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite database file path (relative to backend/) |
| `PORT` | Backend server port |
| `PBI_MCP_COMMAND` | Path to the Power BI Modeling MCP Server executable |
| `PBI_MCP_ARGS` | Arguments passed to the MCP server on startup |
| `TABULAR_EDITOR_PATH` | Path to TabularEditor.exe (defaults to bundled version) |
| `TABULAR_EDITOR_TIMEOUT` | Timeout in ms for Tabular Editor CLI execution |

### Verify Installation

1. Open http://localhost:5173
2. Enter the Power BI Desktop server address (found in PBI Desktop → External Tools → Server info) and the database name
3. Click **Connect** → **Run Analysis**
4. You should see findings categorized by severity

---

## Deployment

### Local (Development)

- Backend and frontend run as separate dev servers
- SQLite database stored locally via Prisma ORM
- Connects to Power BI Desktop on the same machine

### Team / Shared Deployment

```bash
# Build frontend
cd frontend && npm run build    # Static files output to dist/

# Build backend
cd backend && npm run build     # Compiled JS output to dist/
```

- Serve frontend static files from the backend or a separate web server
- Configure environment variables for the target Power BI instance
- Ensure Tabular Editor 2 is installed on the server
- Ensure the MCP server binary is accessible

### Production Considerations

- Replace SQLite with PostgreSQL for concurrent access
- Add an authentication/authorization layer
- Deploy behind a reverse proxy (nginx / Azure App Service)
- Use Azure Key Vault for sensitive configuration
- Consider Azure Container Apps for containerized deployment

---

## Architecture

### System Diagram

![Architecture Diagram](../assets/architecture-diagram.png)

> Interactive version available at [`assets/architecture-diagram.html`](../assets/architecture-diagram.html)

### Data Flow Narratives

#### 1. Analysis Flow

User clicks **Run Analysis** → the backend spawns Tabular Editor 2 as a child process via CLI → Tabular Editor evaluates all 71 BPA rules (written as C# expressions) against the connected semantic model over an XMLA connection → the CLI output is parsed for violations → each violation is stored as a **Finding** in the SQLite database with rule metadata, severity, affected object, and description → findings are returned to the frontend grouped by category and severity.

#### 2. AI Fix Flow

User clicks **AI Fix** on a Finding → the backend creates a GitHub Copilot SDK agent session via `CopilotClient.createSession()` with the Power BI MCP tools available → the agent receives the violation context (rule, object, description) → the agent analyzes the issue and proposes a fix using MCP write tools (e.g., updating a DAX expression, renaming an object) → the proposed write operation is surfaced to the user in the AI Fix Panel → the user reviews and **approves or rejects** → if approved, the fix is applied to the live model via MCP → the session and its outcome are persisted in the database.

#### 3. DAX Query Flow

User writes or generates a DAX query in the Monaco editor → the query is sent to the backend → the backend executes the query via the MCP client's DAX operations tools → results are returned as tabular data and rendered in the frontend.

---

## GitHub Copilot SDK Integration

This application uses `@github/copilot-sdk` to provide AI-powered auto-fix capabilities for BPA violations.

### How It Works

- **Session creation**: `CopilotClient.createSession()` initializes an agentic session with a system prompt describing the Power BI model context and the specific violation to fix.
- **MCP tool wrapping**: Tools from the Power BI Modeling MCP Server (connection operations, database operations, metadata operations, DAX operations) are wrapped as Copilot-invokable tools so the agent can interact with the model.
- **Streaming events**: The session emits real-time events — message deltas, tool execution status, and reasoning — streamed to the frontend via Server-Sent Events (SSE).
- **Session persistence**: All sessions, tool calls, and outcomes are stored in the SQLite database for inspection and replay.

### Approval Workflow

| Operation Type | Examples | Approval |
|---|---|---|
| **Read** | List tables, Get measure expression, Fetch metadata | Auto-approved |
| **Write** | Update DAX expression, Rename column, Create measure | **Requires explicit user approval** |
| **Delete** | Remove unused measure, Delete column | **Requires explicit user approval** |

This ensures the AI agent can freely explore and understand the model, but **cannot modify it without human consent**.

---

## Responsible AI (RAI) Notes

### Human-in-the-Loop

- **All write operations require explicit user approval** — the AI agent cannot modify the Power BI model without human consent.
- Users see exactly what the agent proposes (tool name, parameters, reasoning) before approving.
- Read operations (querying model metadata) are auto-approved for efficiency, as they do not alter the model.

### Transparency

- Every AI agent session is fully inspectable — users can review each step, tool call, and reasoning chain.
- The app shows which MCP tools were invoked, what parameters were used, and what results were returned.
- No hidden or opaque AI actions — the full agent trace is available in the UI and persisted in the database.

### Data Privacy

- The app connects to **locally-running Power BI Desktop** — no model data leaves the user's machine for analysis purposes.
- AI interactions go through GitHub Copilot's existing infrastructure with enterprise-grade compliance and data handling.
- The SQLite database stores session metadata locally; it does not export or transmit model data externally.

### Limitations

- AI fixes are **suggestions** — they may not always be correct for complex model patterns or edge cases.
- The app relies on BPA rules, which may not cover all model quality concerns.
- AI agent effectiveness depends on the clarity of the BPA rule description and the complexity of the violation.
- The tool requires Windows and a local Power BI Desktop instance, limiting cross-platform use.

### Responsible Use Guidelines

- **Always review** AI-proposed fixes before approving.
- **Run verification analysis** after fixes to confirm correctness.
- Use in conjunction with (not as a replacement for) expert model review for critical production models.
- Report any unexpected AI behavior through standard feedback channels.

---

## Project Structure

```
copilot-sdk-challenge/
├── frontend/                   # React 18 + TypeScript SPA
│   ├── src/
│   │   ├── components/         # UI components (FindingCard, ChatFixPanel, etc.)
│   │   ├── pages/              # AnalyzerPage, DaxQueryPage
│   │   ├── services/           # API client
│   │   └── hooks/              # Custom React hooks
│   └── tests/                  # Unit + E2E tests
├── backend/                    # Express.js + TypeScript API
│   ├── src/
│   │   ├── routes/             # REST endpoints
│   │   ├── services/           # Business logic (analysis, chat-fix, DAX)
│   │   ├── mcp/                # MCP client singleton
│   │   └── data/               # BPA rules JSON
│   ├── prisma/                 # Database schema + migrations
│   └── tests/                  # Unit tests
├── docs/                       # Documentation (you are here)
├── specs/                      # Feature specifications
├── assets/                     # Images and diagrams
└── TabularEditor.2.27.2/       # Bundled Tabular Editor 2
```

---

## Testing

| Test Type | Command | Framework | Notes |
|---|---|---|---|
| **Backend Unit Tests** | `cd backend && npm test` | Vitest | Tests services, routes, utilities |
| **Frontend Unit Tests** | `cd frontend && npm test` | Vitest | Tests components, hooks, services |
| **E2E Tests (Mock)** | `cd frontend && npm run test:e2e` | Playwright | Uses mock API, no backend required |
| **E2E Tests (Live)** | `cd frontend && npm run test:e2e:live` | Playwright | Requires running backend + PBI Desktop |

### Running All Tests

```bash
# Backend unit tests
cd backend && npm test

# Frontend unit tests
cd frontend && npm test

# E2E tests (mock API)
cd frontend && npm run test:e2e

# E2E tests (live — requires backend + Power BI Desktop)
cd frontend && npm run test:e2e:live
```

---

## License

See the repository root for license information.
