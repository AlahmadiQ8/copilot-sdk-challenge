# Quickstart: Power BI Best Practices Analyzer & AI Auto-Fix Web App

**Prerequisites**:
- Node.js 18+ installed
- Power BI Desktop running with a Semantic Model open
- GitHub Copilot CLI installed and authenticated (`copilot --version`)
- Git

## 1. Clone & Install

```bash
git clone <repo-url>
cd copilot-sdk-challenge
git checkout 001-pbi-analyzer-app
```

### Backend
```bash
cd backend
npm install
cp .env.example .env   # Contains DATABASE_URL="file:./prisma/dev.db"
npx prisma migrate dev --name init
npx prisma generate     # Generate Prisma client with better-sqlite3 adapter
npm run dev             # Starts Express server on http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # Starts Vite dev server on http://localhost:5173
```

## 2. Connect to Power BI Desktop

1. Open the app at `http://localhost:5173`
2. The app auto-discovers local Power BI Desktop instances
3. Select an instance and click **Connect**
4. Connection status shows in the header

## 3. Run Best Practices Analysis

1. Navigate to the **Analyzer** tab
2. Click **Run Analysis**
3. Wait for the analysis to complete (~30s for models with up to 100 objects)
4. View findings grouped by category with severity indicators

## 4. Fix a Finding with AI

1. Find a violation and click **AI Fix**
2. Watch the progress indicator as the AI agent works
3. Once complete, the finding status updates to **Fixed** or **Fix Failed**
4. Click **Inspect Session** to view step-by-step agent reasoning

## 5. Verify Fixes

1. Click **Rerun Analysis** to re-analyze the model
2. Previously fixed findings should no longer appear

## 6. DAX Query Tab

1. Switch to the **DAX Queries** tab
2. Type a DAX query in the editor (e.g., `EVALUATE 'Sales'`)
3. Click **Run Query** to execute
4. Or enter a natural language prompt and click **Generate** to have AI create the DAX

## Project Structure

```
backend/
├── src/
│   ├── routes/          # Express route handlers
│   ├── services/        # Business logic
│   ├── mcp/             # MCP client setup
│   └── index.ts         # Entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── prisma.config.ts     # Prisma v7 config (datasource URL, paths)
├── generated/prisma/    # Generated Prisma client (gitignored)
└── tests/

frontend/
├── src/
│   ├── components/      # Reusable UI components
│   ├── pages/           # Route-level pages
│   ├── services/        # API client functions
│   └── App.tsx          # Root component
└── tests/
    └── e2e/             # Playwright tests
```

## Key Scripts

| Command | Location | Description |
|---------|----------|-------------|
| `npm run dev` | backend/ | Start Express dev server with hot-reload |
| `npm run dev` | frontend/ | Start Vite dev server |
| `npm run test` | backend/ | Run Vitest unit tests |
| `npm run test` | frontend/ | Run Vitest unit tests |
| `npm run test:e2e` | frontend/ | Run Playwright E2E tests (mock API) |
| `npm run test:e2e:live` | frontend/ | Run Playwright E2E tests (real API) |
| `npx prisma studio` | backend/ | Open Prisma Studio for DB inspection |
| `npx prisma migrate dev` | backend/ | Run database migrations |

## Environment Variables

### Backend (.env)
```
DATABASE_URL="file:./prisma/dev.db"
PORT=3001
PBI_MCP_COMMAND=npx
PBI_MCP_ARGS=-y,@anthropic/powerbi-modeling-mcp
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api
```

### Playwright (.env)
```
USE_MOCK_API=true   # Set to false for live API tests
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript | UI framework |
| Styling | Tailwind CSS | Utility-first CSS |
| DAX Editor | Monaco Editor | Code editor with syntax highlighting |
| Backend | Express.js + TypeScript | API server |
| ORM | Prisma v7 + better-sqlite3 | Database access via driver adapter |
| Database | SQLite (better-sqlite3) | Local persistence |
| AI Agent | GitHub Copilot SDK | AI-powered fixes and DAX generation |
| Model Access | Power BI Modeling MCP | Connect to PBI Desktop |
| MCP Client | @modelcontextprotocol/sdk | TypeScript MCP client |
| Unit Testing | Vitest | Fast unit test runner |
| E2E Testing | Playwright | Browser automation with configurable mocks |
