# API Contracts: Tabular Editor Rules Engine

**Phase**: 1 | **Date**: 2026-02-23

## Summary

**No API contract changes.** This feature is a backend-internal refactor. All existing REST API endpoints, request/response schemas, and status codes remain identical. The frontend is unaffected.

The only external-facing change is a new environment variable.

## Unchanged Endpoints

The following endpoints continue to function exactly as before:

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/analysis/run` | No change — still triggers analysis, returns `AnalysisRun` |
| `GET` | `/api/analysis/runs` | No change — list analysis runs |
| `GET` | `/api/analysis/runs/{runId}` | No change — get run with findings |
| `GET` | `/api/analysis/runs/{runId}/findings` | No change — list findings with filters |
| `GET` | `/api/findings/{findingId}` | No change — get finding detail |
| `POST` | `/api/findings/{findingId}/fix` | No change — trigger AI fix |
| `GET` | `/api/rules` | No change — list BPA rules |

## New Error Responses

The `POST /api/analysis/run` endpoint may return new error messages when Tabular Editor is misconfigured, but the response schema (`ErrorResponse`) is unchanged:

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| `TABULAR_EDITOR_PATH` not set | `422` | `"TABULAR_EDITOR_PATH environment variable is not configured"` |
| Executable not found at path | `422` | `"Tabular Editor executable not found at: <path>"` |
| Process timeout | `500` | `"Tabular Editor analysis timed out after 120 seconds"` |
| Process crash / non-zero exit | `500` | `"Tabular Editor analysis failed: <stderr>"` |

These use the existing `ErrorResponse` schema:
```json
{
  "error": "string",
  "details": "string (optional)"
}
```

## New Environment Variable

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TABULAR_EDITOR_PATH` | Yes | — | Absolute path to `TabularEditor.exe` |
| `TABULAR_EDITOR_TIMEOUT` | No | `120000` | Process timeout in milliseconds |

## Full API Contract Reference

See [001 contracts/api.yaml](../001-pbi-analyzer-app/contracts/api.yaml) for the complete OpenAPI specification. No modifications needed.
