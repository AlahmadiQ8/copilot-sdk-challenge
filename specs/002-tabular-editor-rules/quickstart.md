# Quickstart: Tabular Editor Rules Engine

**Prerequisites** (in addition to [001 quickstart](../001-pbi-analyzer-app/quickstart.md)):
- Tabular Editor 2 installed (version 2.27.2 or later)
- Power BI Desktop running with a Semantic Model open
- .NET Framework 4.8 (required by Tabular Editor 2 on Windows)

## 1. Configure Tabular Editor Path

Add the `TABULAR_EDITOR_PATH` environment variable to `backend/.env`:

```env
# Existing variables
DATABASE_URL="file:./prisma/dev.db"
PORT=3001
PBI_MCP_COMMAND=C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe
PBI_MCP_ARGS=--start

# New: Tabular Editor 2 executable path
TABULAR_EDITOR_PATH=C:\\Users\\momohammad\\Dev\\copilot-sdk-challenge\\TabularEditor.2.27.2\\TabularEditor.exe
```

**Optional**: Configure a custom timeout (default is 120 seconds):
```env
TABULAR_EDITOR_TIMEOUT=120000
```

## 2. Verify Tabular Editor Works

Test that Tabular Editor can connect to your Power BI Desktop instance:

```powershell
# From the repo root, test local instance detection
.\TabularEditor.2.27.2\TabularEditor.exe -L -A backend\src\data\bpa-rules.json
```

Expected output: lines like `Column 'TableName'[ColumnName] violates rule "RuleName"` for each BPA violation found.

## 3. Run the Backend

```bash
cd backend
npm run dev
```

The backend will now use Tabular Editor for rule evaluation instead of DAX queries.

## 4. Run Analysis

1. Open `http://localhost:5173`
2. Connect to a Power BI Desktop instance
3. Click **Run Analysis**
4. All 71 BPA rules are now evaluated (previously only ~10 had DAX coverage)

## What Changed

| Before | After |
|--------|-------|
| ~10 rules evaluated via manual DAX queries | All 71 BPA rules evaluated natively |
| `dax-rule-queries.json` with hand-translated queries | Tabular Editor evaluates C# expressions directly |
| Partial coverage, many rules skipped | Complete coverage of all applicable rules |
| MCP DAX execution for each rule | Single CLI invocation evaluates all rules |

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/tabular-editor.service.ts` | **New**: CLI invocation and output parsing |
| `backend/src/services/analysis.service.ts` | **Modified**: Calls new TE service instead of DAX evaluation |
| `backend/tests/unit/tabular-editor.service.test.ts` | **New**: Unit tests for parser and process management |
| `backend/.env` | **Modified**: Added `TABULAR_EDITOR_PATH` |
| `backend/src/data/dax-rule-queries.json` | **Removed**: No longer needed |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "TABULAR_EDITOR_PATH environment variable is not configured" | Set `TABULAR_EDITOR_PATH` in `backend/.env` |
| "Tabular Editor executable not found" | Verify the path in `.env` points to a valid `TabularEditor.exe` |
| "Tabular Editor analysis timed out" | Increase `TABULAR_EDITOR_TIMEOUT` in `.env`, or check PBI Desktop is running |
| "Connection cannot be made" from TE | Ensure Power BI Desktop has an active model open and the port matches |
| Zero findings returned | Verify the BPA rules file is correct and the model has applicable objects |
