# Power BI Best Practices Analyzer & AI Auto-Fix

Analyze Power BI models against best practice rules and fix violations with a GitHub Copilot Agent

> \> [Demo Video](https://youtu.be/xYDh9zKUyOI) <br>
> \> [Slides](./assets/slides.pdf)

*GitHub Copilot SDK Challenge Submission*

A [community workflow](https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Automate-Power-BI-Model-Optimization-Best-Practice-Analyzer/ba-p/5000187) showed that Tabular Editor BPA + AI fixes via MCP is a powerful combination. This project takes it further with the **GitHub Copilot SDK** — embedding the full analyze-fix-verify loop into one web app with programmatic approval gates, real-time agent streaming, and a persistent audit trail.

**Analyze** BPA rules. **Fix** with a Copilot SDK agent that requires your approval for every write. **Verify** in one click.

![Architecture Diagram](assets/architecture-diagram.png)


## Prerequisites

- **Node.js** 18+
- **Power BI Desktop** with a semantic model open
- **GitHub Copilot** authenticated (`copilot --version`)
- **[Power BI Modeling MCP Server](https://marketplace.visualstudio.com/items?itemName=analysis-services.powerbi-modeling-mcp)** (VS Code extension or standalone exe)
- **Tabular Editor 2** (bundled in `TabularEditor.2.27.2/`, or provide your own path)

## Quick Start

```bash
# Backend
cd backend && npm install && cp .env.example .env
npx prisma migrate dev && npm run dev    # → http://localhost:3001

# Frontend (new terminal)
cd frontend && npm install && npm run dev # → http://localhost:5173
```

Edit `backend/.env` with your paths:

```env
DATABASE_URL="file:./prisma/dev.db"
PBI_MCP_COMMAND=C:\path\to\powerbi-modeling-mcp.exe
PBI_MCP_ARGS=--start
TABULAR_EDITOR_PATH=..\TabularEditor.2.27.2\TabularEditor.exe
```

## [Full Documentation](./docs/README.md)

Architecture, Copilot SDK integration, deployment, testing, and RAI notes.

## License

[MIT](LICENSE)
