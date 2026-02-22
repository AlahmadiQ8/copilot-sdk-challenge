# Research: Tabular Editor Rules Engine

**Phase**: 0 | **Date**: 2026-02-23

## R1: Tabular Editor 2 CLI — BPA Analysis Command

**Decision**: Use `TabularEditor.exe <server> <database> -A <rules-file>` to evaluate BPA rules via CLI.

**Rationale**: Tabular Editor 2.27.2 ships a fully functional CLI that connects to Analysis Services / Power BI Desktop instances and runs the Best Practice Analyzer natively. This eliminates the need for the custom DAX-query translation layer.

**CLI syntax** (confirmed via `TabularEditor.exe -?` and live testing):
```
TabularEditor.exe <server> <database> -A <rules-file-path>
```

- `server`: Connection string, e.g., `localhost:61460` (same format used by the MCP client)
- `database`: Database ID or name. If `""` (empty), picks the first available database.
- `-A <rules>`: Run Best Practice Analyzer with the specified rules file. When a file path is provided, only that file's rules are evaluated (local user/machine rules are skipped, model annotation rules still apply).
- `-AX <rules>`: Same as `-A` but also excludes rules defined in model annotations.

**Additional output flags**:
- `-T <file.trx>`: Produce a VSTEST (TRX) XML results file alongside console output.
- `-V`: Output in Azure DevOps logging format.
- `-G`: Output in GitHub Actions workflow command format.

**Alternatives considered**:
- `-T` TRX output: Structured XML, but groups violations per rule without individual object types. Console output provides richer per-violation detail.
- `-G` GitHub Actions format: Useful for CI but console output is simpler to parse.
- `-AX` flag: Not needed since our rules file is the complete set and we want model annotation rules included.

---

## R2: Console Output Format

**Decision**: Parse Tabular Editor's console stdout line-by-line using regex to extract violations.

**Rationale**: The console output format is consistent and machine-parseable. Each violation is a single line with a well-defined pattern.

**Output format** (confirmed via live testing against a real Power BI model):

Each violation is one line in this format:
```
<ObjectType> '<TableName>'[<ObjectName>] violates rule "<RuleName>"
<ObjectType> [<ObjectName>] violates rule "<RuleName>"
<ObjectType> '<TableName>' violates rule "<RuleName>"
```

**Observed patterns**:
| Pattern | Example |
|---------|---------|
| Column with table | `Column 'duration'[Total] violates rule "[Formatting] Do not summarize numeric columns"` |
| Measure (no table) | `Measure [VaR % of BV] violates rule "[Formatting] Percentages should be formatted..."` |
| Table | `Table 'ALM_tabl3' violates rule "[Performance] Consider a star-schema..."` |
| Calculated Table | `'DateTableTemplate_xxx' (Calculated Table) violates rule "..."` |
| Relationship | `Relationship ... violates rule "..."` |

**Regex for parsing** (covers all observed patterns):
```
/^(.+?) violates rule "(.+)"$/
```

The first capture group contains the full object reference (e.g., `Column 'duration'[Total]`). The second capture group is the rule name (matches `BpaRule.Name` exactly).

**Object reference sub-parsing**:
From the object reference string, extract:
- Object type: leading word(s) before the first `'` or `[` (e.g., `Column`, `Measure`, `Table`, `Calculated Table`)
- Table name: text between single quotes `'...'`
- Object name: text between square brackets `[...]`
- Affected object string: reconstruct as `'Table'[Object]` format to match existing finding schema

**Exit codes**:
- `0`: Success (analysis ran, may or may not have findings)
- `1`: Error (connection failed, invalid arguments, etc.)

**Alternatives considered**: TRX XML parsing — the TRX format groups violations by rule and provides pass/fail per rule, but the StackTrace field lists objects without explicit types (e.g., `'duration'[Total] (Column)`). Console output has the same information in a more regular line-per-violation format. Chose console for simplicity.

---

## R3: BPA Rules File Compatibility

**Decision**: The existing `bpa-rules.json` file is directly compatible with Tabular Editor 2's `-A` flag — no transformation needed.

**Rationale**: Tabular Editor 2's BPA rules file format is an array of rule objects with fields: `ID`, `Name`, `Category`, `Description`, `Severity`, `Scope`, `Expression`, `FixExpression`, `CompatibilityLevel`. This is the exact format of the existing file at `backend/src/data/bpa-rules.json`.

**Confirmed**: Running `TabularEditor.exe -L -A bpa-rules.json` against a live PBI Desktop model produced 200+ findings across all rule categories, proving full compatibility.

**Rule count**: The existing JSON has 71 rules. The prior DAX-query approach covered only ~10 rules (those in `dax-rule-queries.json`). Tabular Editor evaluates all 71 rules natively.

**Alternatives considered**: Transforming the rules JSON to a different format — unnecessary since the format is already correct.

---

## R4: Rule Name → Rule ID Mapping

**Decision**: Map Tabular Editor output back to rule metadata using the rule `Name` field, which appears verbatim in the console output as the "violates rule" text.

**Rationale**: Tabular Editor's console output contains the rule display name (e.g., `[Performance] Do not use floating point data types`). This exactly matches the `Name` field in `bpa-rules.json`. Build a `Map<string, BpaRule>` from the rules data to look up rule ID, category, severity, description, and fix expression availability.

**Confirmed**: The testName in TRX output also matches the `Name` field exactly. Console output rule names were verified to match the JSON `Name` field in live testing.

**Alternatives considered**: Using TRX output which has testId — but testId is an auto-incremented integer, not the rule ID. The Name-based lookup is more reliable.

---

## R5: Connection String Compatibility

**Decision**: The `serverAddress` stored in the MCP connection (format: `localhost:<port>`) is directly usable as the Tabular Editor `server` argument. The `databaseName` stored in the MCP connection is usable as the `database` argument.

**Rationale**: Both the MCP server and Tabular Editor connect to the same Analysis Services instance behind Power BI Desktop. The connection format is identical.

**Confirmed**: MCP's connection uses `localhost:61460` format. Tabular Editor's `-L` flag internally resolves to the same `localhost:<port>` connection. Passing `localhost:<port>` directly as the server argument to Tabular Editor works (verified that connection failure was due to PBI port change, not format incompatibility).

**Alternatives considered**: Using Tabular Editor's `-L` flag for local instance detection — rejected because we already have the server address from the MCP connection and direct connection avoids ambiguity with multiple PBI instances.

---

## R6: Process Management Strategy

**Decision**: Use Node.js `child_process.execFile` with a timeout to invoke Tabular Editor as a one-shot process per analysis run.

**Rationale**: Each analysis is a single CLI invocation that runs, produces output, and exits. No persistent process needed. `execFile` is simpler than `spawn` for collecting complete stdout/stderr output, and it natively supports timeout via the `timeout` option.

**Timeout**: 120 seconds default (configurable via optional env var `TABULAR_EDITOR_TIMEOUT`). Models with < 100 tables completed BPA analysis in under 10 seconds during testing.

**Error handling**:
| Scenario | Detection | Behavior |
|----------|-----------|----------|
| Executable not found | `fs.access` check before exec | Throw error with clear message before creating analysis run |
| Non-zero exit code | `error.code` from execFile callback | Mark analysis FAILED, log stderr |
| Timeout exceeded | `execFile` timeout option | Process killed (SIGTERM), mark analysis FAILED |
| Process crash | `error.signal` from callback | Mark analysis FAILED, log signal info |
| Zero results / empty stdout | Check parsed findings count | Valid scenario — model may have no violations |

**Alternatives considered**:
- `spawn` with streaming: More complex, not needed since we wait for complete output.
- Keeping Tabular Editor running as a daemon: Unnecessary — each invocation is fast and stateless.

---

## R7: Recheck Strategy

**Decision**: For rechecking individual findings, re-run the full Tabular Editor BPA analysis and check whether the specific finding's affected object + rule combination still appears in the results.

**Rationale**: Tabular Editor CLI does not support evaluating a single rule — it always evaluates all rules in the provided file. Running a full analysis is fast (< 10s for typical models) and provides a consistent, accurate result.

**Optimization**: Cache the Tabular Editor output for a short period (e.g., 30 seconds) so that multiple rechecks in quick succession reuse the same analysis output.

**Alternatives considered**:
- Creating a single-rule JSON file per recheck: Possible but adds file I/O complexity for minimal benefit since full analysis is already fast.
- Using the old DAX-query approach for individual rechecks: Rejected — would require maintaining two evaluation engines.

---

## R8: What Gets Removed

**Decision**: The DAX-query-based evaluation code and data are removed as part of this change.

**Rationale**: Tabular Editor evaluates all 71 rules natively, completely superseding the partial DAX-query approach that covered only ~10 rules.

**Removed artifacts**:
- `backend/src/data/dax-rule-queries.json` — Manual DAX translations (no longer needed)
- `evaluateRules()` function in `analysis.service.ts` — DAX evaluation logic
- `loadDaxRuleQueries()` function in `analysis.service.ts` — DAX query loading
- `parseDaxResult()`, `parseCsvResponse()`, `parseCsvLine()`, `getPropStr()` functions — MCP result parsing for DAX evaluation
- `recheckFinding()` DAX-based recheck logic — replaced with Tabular Editor-based recheck

**Preserved**: All MCP client code, connection management, Prisma models, API routes, and frontend remain unchanged.
