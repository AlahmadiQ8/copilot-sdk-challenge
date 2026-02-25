# Power BI Best Practices Analyzer & AI Auto-Fix

**Automated model governance — from detection to AI-powered remediation — for every Power BI team.**

[![GitHub Copilot SDK](https://img.shields.io/badge/GitHub%20Copilot-SDK-blue?logo=github)](https://github.com/features/copilot)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📋 Project Summary

> **GitHub Copilot SDK Challenge Submission (MCAPS Internal)**

The [community-recommended workflow](https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Automate-Power-BI-Model-Optimization-Best-Practice-Analyzer/ba-p/5000187) for Power BI model optimization requires bouncing between four tools: Tabular Editor for BPA analysis, a text editor for batching violations, Claude Desktop for AI fixes, and Power BI Desktop for validation. It works — but it's slow, fragile, and impossible to standardize across teams. This app collapses that entire multi-tool workflow into a single web interface powered by the GitHub Copilot SDK. Tabular Editor 2 evaluates all 71 BPA rules via CLI. The GitHub Copilot SDK drives an AI agent that fixes violations through the Power BI MCP Server — with built-in human-in-the-loop approval before any write touches the model. One click to analyze, one click to fix, one click to verify. What took 45–60 minutes of copy-pasting across tools becomes a guided, auditable workflow any team member can run.

---

## 🔴 The Problem

A [popular community approach](https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Automate-Power-BI-Model-Optimization-Best-Practice-Analyzer/ba-p/5000187) describes using Tabular Editor's Best Practice Analyzer with Claude Desktop to fix model violations. While effective, the workflow has significant friction:

- **4+ tools, constant context-switching.** Run BPA in Tabular Editor → copy violations to a text editor → paste batches into Claude Desktop → validate in Power BI Desktop → repeat. Every cycle requires manual handoffs.
- **Copy-paste driven.** Violations are transferred as raw text between tools. No structured tracking, no status management, no way to pick up where you left off.
- **No built-in safety rails.** The AI applies changes based on prompt instructions ("evaluate before applying"). There's no programmatic approval gate — safety depends entirely on prompt engineering.
- **Not repeatable or shareable.** The workflow lives in one person's Claude conversation. No audit trail, no team access, no way to standardize across models or analysts.
- **Tied to a specific AI provider.** The approach requires Claude Desktop — it's not embeddable, extensible, or enterprise-ready.

---

## ✅ The Solution

This app replaces the multi-tool workflow with a single integrated experience, powered by the GitHub Copilot SDK:

| Manual Workflow (Before) | This App (After) |
|---|---|
| Open Tabular Editor → press F10 → scan violations | Click **Run Analysis** — Tabular Editor CLI evaluates all 71 rules automatically |
| Copy violations to text editor → group into batches | Findings displayed in a filterable, categorized dashboard |
| Paste into Claude Desktop → write safety prompts | Click **AI Fix** — Copilot SDK agent handles it with built-in approval workflow |
| Read Claude's chat output to see what changed | Click **Inspect Session** — full step-by-step agent trace |
| Switch to PBI Desktop → test manually → repeat | Click **Rerun Analysis** — instant verification in the same window |

### Key capabilities:

- 🔍 **Automated Analysis** — All 71 BPA rules evaluated via Tabular Editor 2 CLI. Findings categorized by severity and object.
- 🤖 **AI-Powered Fix** — GitHub Copilot SDK agents fix violations through MCP. Write operations require explicit human approval.
- 🔄 **One-Click Verification** — Rerun analysis to confirm fixes without switching tools.
- 🔎 **Full Auditability** — Every AI session persisted and inspectable. Every tool call, every parameter, every reasoning step.
- 📊 **DAX Workspace** — Write and test DAX queries with Monaco editor.

---

## 🏗️ Architecture Overview

![Architecture Diagram](assets/architecture-diagram.png)

**How it works:**

1. The **React frontend** provides the dashboard, violation explorer, and DAX workspace.
2. The **Express backend** orchestrates all operations — running BPA analysis, managing AI agent sessions, and proxying MCP calls.
3. **Tabular Editor 2 CLI** evaluates BPA rules against the connected model and returns structured violation data.
4. The **GitHub Copilot SDK** powers AI agents that reason about violations, propose fixes using MCP tools, and wait for human approval at each step.
5. The **Power BI MCP Server** provides read/write access to the semantic model over XMLA, used by both the backend and the AI agent.

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Details |
|---|---|
| **Node.js** | 18+ |
| **Power BI Desktop** | With a semantic model open |
| **Tabular Editor 2** | Bundled in `TabularEditor.2.27.2/` |
| **GitHub Copilot CLI** | Authenticated (`gh auth login`) |

### Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Configuration

Create `backend/.env`:

```env
DATABASE_URL="file:./prisma/dev.db"
PBI_MCP_COMMAND=path/to/powerbi-modeling-mcp.exe
PBI_MCP_ARGS=--start
TABULAR_EDITOR_PATH=path/to/TabularEditor.exe
```

> **Tip:** The bundled Tabular Editor path is `../TabularEditor.2.27.2/TabularEditor.exe` relative to the backend directory.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, TypeScript | Component-based UI |
| **Styling** | Tailwind CSS | Utility-first responsive design |
| **Code Editor** | Monaco Editor | DAX query authoring with syntax highlighting |
| **Backend** | Express.js, TypeScript | REST API and orchestration layer |
| **Database** | Prisma + SQLite | Session persistence and violation tracking |
| **AI Engine** | GitHub Copilot SDK | Agentic AI with human-in-the-loop approval |
| **Model Access** | MCP SDK | Standardized Power BI model read/write |
| **BPA Engine** | Tabular Editor 2 CLI | Industry-standard rule evaluation (71 rules) |
| **Unit Tests** | Vitest | Backend and frontend test suites |
| **E2E Tests** | Playwright | End-to-end browser testing |

---

## 📚 Documentation

Full documentation is available in [`/docs`](./docs) covering:

- Problem statement and solution design
- Prerequisites, setup, and deployment guide
- Architecture deep-dive with data flow narratives
- GitHub Copilot SDK integration details
- Responsible AI (RAI) considerations

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
