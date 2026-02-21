import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
import { getRawRules } from './rules.service.js';
import { getConnectionStatus } from '../mcp/client.js';
import { logger, childLogger } from '../middleware/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DaxRuleQuery {
  ruleId: string;
  description: string;
  query: string;
  objectType: string;
  mapResult: Record<string, string>;
  threshold?: number;
}

let cachedDaxRuleQueries: DaxRuleQuery[] | null = null;
function loadDaxRuleQueries(): DaxRuleQuery[] {
  if (cachedDaxRuleQueries) return cachedDaxRuleQueries;
  try {
    const raw = readFileSync(join(__dirname, '..', 'data', 'dax-rule-queries.json'), 'utf-8');
    cachedDaxRuleQueries = JSON.parse(raw);
    return cachedDaxRuleQueries!;
  } catch {
    return [];
  }
}

interface ModelObject {
  name: string;
  type: string;
  properties: Record<string, unknown>;
  expression?: string;
}

interface AnalysisContext {
  tableRelCounts: Map<string, number>;
  columnInRel: Set<string>;
  allTables: ModelObject[];
  allMeasures: ModelObject[];
  allColumns: ModelObject[];
  allRelationships: ModelObject[];
}

// ─── Metadata fetching ───────────────────────────────────────────────

async function fetchModelMetadata(): Promise<ModelObject[]> {
  const client = getMcpClient();
  if (!client) throw new Error('Not connected to a model');

  const objects: ModelObject[] = [];

  // Parallel: tables, columns, relationships, model stats
  const [tablesResult, columnsResult, relsResult, statsResult] = await Promise.all([
    client.callTool({ name: 'table_operations', arguments: { request: { operation: 'List' } } }),
    client.callTool({ name: 'column_operations', arguments: { request: { operation: 'List' } } }),
    client.callTool({ name: 'relationship_operations', arguments: { request: { operation: 'List' } } }),
    client.callTool({ name: 'model_operations', arguments: { request: { operation: 'GetStats' } } }),
  ]);

  // Parse stats for table isHidden + measure counts
  const statsRaw = parseToolResultRaw(statsResult);
  const statsPayload = (statsRaw?.data as Record<string, unknown>) ?? statsRaw ?? {};
  const statsTables: Array<Record<string, unknown>> =
    (statsPayload as { Tables?: Array<Record<string, unknown>> }).Tables ?? [];
  const tableStatsMap = new Map<string, Record<string, unknown>>();
  for (const t of statsTables) {
    const name = getPropStr(t, 'name', 'Name');
    if (name) tableStatsMap.set(name, t);
  }

  // Parse relationships first — needed for cross-reference
  const rels = parseToolResult(relsResult);
  for (const r of rels) {
    const relName = getPropStr(r, 'name', 'Name');
    const fromT = getPropStr(r, 'fromTable', 'FromTable', 'fromTableName', 'FromTableName');
    const toT = getPropStr(r, 'toTable', 'ToTable', 'toTableName', 'ToTableName');
    objects.push({
      name: relName || (fromT && toT ? `${fromT}->${toT}` : `Relationship_${objects.length}`),
      type: 'Relationship',
      properties: normProps(r),
    });
  }

  // Parse tables with enriched props
  const tables = parseToolResult(tablesResult);
  for (const table of tables) {
    const tName = getPropStr(table, 'name', 'Name');
    const stats = tableStatsMap.get(tName) || {};
    const isAutoDate = tName.startsWith('LocalDateTable_') || tName.startsWith('DateTableTemplate_');
    objects.push({
      name: tName,
      type: isAutoDate ? 'CalculatedTable' : 'Table',
      properties: normProps({
        ...table,
        ...stats,
        Name: tName,
        ObjectTypeName: isAutoDate ? 'Calculated Table' : 'Table',
        IsHidden: stats.isHidden ?? table.isHidden ?? false,
      }),
    });
  }

  // Parse columns (grouped by table)
  const columnGroups = parseToolResult(columnsResult);
  for (const group of columnGroups) {
    const tableName = getPropStr(group as Record<string, unknown>, 'tableName', 'TableName');
    const cols = Array.isArray(group.columns) ? group.columns as Record<string, unknown>[] : [group];
    for (const col of cols) {
      const colName = getPropStr(col as Record<string, unknown>, 'name', 'Name', 'ExplicitName', 'columnName', 'ColumnName');
      const colTableName = colName ? (tableName ? `'${tableName}'[${colName}]` : `[${colName}]`) : (tableName || `Column_${objects.length}`);
      objects.push({
        name: colTableName,
        type: (col.isCalculated || col.Type === 'Calculated') ? 'CalculatedColumn' : 'DataColumn',
        properties: normProps({
          ...col,
          Name: colName,
          TableName: tableName,
          DataType: col.dataType || col.DataType || '',
        }),
        expression: String(col.expression || col.Expression || ''),
      });
    }
  }

  // Fetch full measure details — batch Get per table
  const measuresWithDetails = await fetchMeasureDetails(client, tableStatsMap);
  for (const m of measuresWithDetails) {
    const tableName = getPropStr(m, 'TableName', 'tableName');
    const mName = getPropStr(m, 'Name', 'name');
    const measFullName = mName ? (tableName ? `'${tableName}'[${mName}]` : `[${mName}]`) : (tableName || `Measure_${objects.length}`);
    objects.push({
      name: measFullName,
      type: 'Measure',
      properties: normProps(m),
      expression: String(m.Expression || m.expression || ''),
    });
  }

  return objects;
}

async function fetchMeasureDetails(
  client: ReturnType<typeof getMcpClient> & object,
  tableStatsMap: Map<string, Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  // Identify tables with measures
  const tablesWithMeasures: string[] = [];
  for (const [name, stats] of tableStatsMap) {
    if ((stats.measureCount as number) > 0) tablesWithMeasures.push(name);
  }
  if (tablesWithMeasures.length === 0) {
    // Fall back to basic List
    const measuresResult = await (client as { callTool: (arg: unknown) => Promise<unknown> }).callTool({
      name: 'measure_operations',
      arguments: { request: { operation: 'List' } },
    });
    return parseToolResult(measuresResult).map((m) => ({ ...m, Name: getPropStr(m, 'name', 'Name') }));
  }

  try {
    // Get measure names per table via table_operations Get (batch)
    const tableGetResult = await (client as { callTool: (arg: unknown) => Promise<unknown> }).callTool({
      name: 'table_operations',
      arguments: {
        request: {
          operation: 'Get',
          References: tablesWithMeasures.map((name) => ({ Name: name })),
          Options: { ContinueOnError: true },
        },
      },
    });
    // MCP batch Get returns { data: [table1, table2, ...] } — each with a measures[] array
    const tableGetData = parseToolResult(tableGetResult);

    // Build references for measure Get
    const measureRefs: Array<{ Name: string; TableName: string }> = [];
    for (const tObj of tableGetData) {
      const tName = getPropStr(tObj, 'name', 'Name');
      const measureNames: string[] = (tObj.measures || tObj.Measures || []) as string[];
      for (const mName of measureNames) {
        measureRefs.push({ Name: mName, TableName: tName });
      }
    }

    if (measureRefs.length === 0) {
      throw new Error('No measure references found');
    }

    // Batch Get all measures — MCP returns { data: [measure1, measure2, ...] }
    const measureGetResult = await (client as { callTool: (arg: unknown) => Promise<unknown> }).callTool({
      name: 'measure_operations',
      arguments: {
        request: {
          operation: 'Get',
          References: measureRefs,
          Options: { ContinueOnError: true },
        },
      },
    });
    const measureGetData = parseToolResult(measureGetResult);

    if (measureGetData.length > 0) {
      return measureGetData.map((m) => ({
        ...m,
        Name: getPropStr(m, 'name', 'Name'),
        TableName: getPropStr(m, 'tableName', 'TableName'),
        Expression: getPropStr(m, 'expression', 'Expression'),
        FormatString: getPropStr(m, 'formatString', 'FormatString'),
        IsHidden: m.isHidden ?? m.IsHidden ?? false,
        Description: getPropStr(m, 'description', 'Description'),
      }));
    }
    throw new Error('No measure results');
  } catch (err) {
    logger.warn({ err }, 'Failed to batch-fetch measure details, falling back to List');
    const measuresResult = await (client as { callTool: (arg: unknown) => Promise<unknown> }).callTool({
      name: 'measure_operations',
      arguments: { request: { operation: 'List' } },
    });
    return parseToolResult(measuresResult).map((m) => ({ ...m, Name: getPropStr(m, 'name', 'Name') }));
  }
}

/** Safely extract a string property from an object, trying multiple keys */
function getPropStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (val !== null && val !== undefined && val !== '') return String(val);
  }
  return '';
}

/** Normalize properties to ensure both camelCase and PascalCase access */
function normProps(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const [key, value] of Object.entries(obj)) {
    // Ensure PascalCase version exists
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    if (!(pascal in result)) result[pascal] = value;
    // Ensure camelCase version exists
    const camel = key.charAt(0).toLowerCase() + key.slice(1);
    if (!(camel in result)) result[camel] = value;
  }
  return result;
}

function parseToolResult(result: unknown): Array<Record<string, unknown>> {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (!content || content.length === 0 || !content[0].text) return [];
  try {
    const parsed = JSON.parse(content[0].text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    return [parsed];
  } catch {
    return [];
  }
}

/** Parse full MCP response object (not just data array) */
function parseToolResultRaw(result: unknown): Record<string, unknown> | null {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (!content || content.length === 0 || !content[0].text) return null;
  try {
    return JSON.parse(content[0].text);
  } catch {
    return null;
  }
}

// ─── Rule Evaluation ─────────────────────────────────────────────────

interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: number;
  description: string;
  affectedObject: string;
  objectType: string;
  hasAutoFix: boolean;
}

function evaluateRule(
  rule: {
    ID: string;
    Name: string;
    Category: string;
    Severity: number;
    Description: string;
    Scope: string;
    Expression: string;
    FixExpression?: string;
  },
  objects: ModelObject[],
  ctx: AnalysisContext,
): RuleEvaluation[] {
  const findings: RuleEvaluation[] = [];
  const scopes = rule.Scope.split(',').map((s) => s.trim());

  const scopeMap: Record<string, string[]> = {
    Table: ['Table'],
    CalculatedTable: ['CalculatedTable'],
    Measure: ['Measure'],
    DataColumn: ['DataColumn'],
    CalculatedColumn: ['CalculatedColumn'],
    CalculatedTableColumn: ['CalculatedColumn'],
    Column: ['DataColumn', 'CalculatedColumn'],
    Relationship: ['Relationship'],
    Model: ['Model'],
    Partition: ['Partition'],
    KPI: [],
    CalculationItem: [],
    CalculationGroup: [],
    Hierarchy: [],
    Level: [],
    Perspective: [],
    TablePermission: [],
    ModelRole: [],
    ProviderDataSource: [],
    StructuredDataSource: [],
    NamedExpression: [],
  };

  const targetTypes = scopes.flatMap((s) => scopeMap[s] || [s]);
  const targetObjects = objects.filter((o) => targetTypes.includes(o.type));

  for (const obj of targetObjects) {
    try {
      if (evaluateExpr(rule.Expression, obj, ctx)) {
        findings.push({
          ruleId: rule.ID,
          ruleName: rule.Name,
          category: rule.Category,
          severity: rule.Severity,
          description: rule.Description || '',
          affectedObject: obj.name,
          objectType: obj.type,
          hasAutoFix: !!rule.FixExpression,
        });
      }
    } catch {
      continue;
    }
  }

  return findings;
}

// ─── Compound Expression Evaluator ───────────────────────────────────

function evaluateExpr(expr: string, obj: ModelObject, ctx: AnalysisContext): boolean {
  let normalized = expr.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
  // Normalize C# logical operators to keyword form
  normalized = normalized.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  // Collapse extra whitespace from operator substitution
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return evalCompound(normalized, obj, ctx);
}

function evalCompound(expr: string, obj: ModelObject, ctx: AnalysisContext): boolean {
  expr = expr.trim();
  if (!expr) return false;

  // Strip balanced outer parens
  while (expr.startsWith('(') && findMatchingParen(expr, 0) === expr.length - 1) {
    expr = expr.slice(1, -1).trim();
  }

  // Split on top-level 'or' (lowest precedence)
  const orParts = splitTopLevel(expr, / \bor\b /i);
  if (orParts.length > 1) {
    return orParts.some((p) => evalCompound(p.trim(), obj, ctx));
  }

  // Split on top-level 'and'
  const andParts = splitTopLevel(expr, / \band\b /i);
  if (andParts.length > 1) {
    return andParts.every((p) => evalCompound(p.trim(), obj, ctx));
  }

  // Handle 'not' prefix
  const notMatch = expr.match(/^not\b\s*(.*)/i);
  if (notMatch) {
    return !evalCompound(notMatch[1].trim(), obj, ctx);
  }

  // Handle '!' prefix (C# negation)
  if (expr.startsWith('!')) {
    return !evalCompound(expr.slice(1).trim(), obj, ctx);
  }

  return evalAtom(expr, obj, ctx);
}

function findMatchingParen(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(expr: string, delimiter: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;

  while (i < expr.length) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') depth--;

    if (depth === 0) {
      const remaining = expr.substring(i);
      const m = remaining.match(delimiter);
      if (m && m.index === 0) {
        parts.push(current);
        current = '';
        i += m[0].length;
        continue;
      }
    }
    current += expr[i];
    i++;
  }
  parts.push(current);
  return parts.filter((p) => p.trim().length > 0);
}

// ─── Atom Evaluator ──────────────────────────────────────────────────

function evalAtom(expr: string, obj: ModelObject, ctx: AnalysisContext): boolean {
  const p = obj.properties;

  // --- Constants ---
  if (expr === '1=1') return true;
  if (/^true$/i.test(expr)) return true;
  if (/^false$/i.test(expr)) return false;

  // --- RegEx.IsMatch(Property, "pattern") ---
  const regexMatch = expr.match(/^RegEx\.IsMatch\s*\(\s*(\w+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)$/i);
  if (regexMatch) {
    const value = resolveProp(regexMatch[1], obj) || '';
    let pattern = regexMatch[2];
    // Strip C# inline (?i) flag — JS doesn't support it; use 'i' flag instead
    let flags = '';
    if (pattern.startsWith('(?i)')) {
      pattern = pattern.slice(4);
      flags = 'i';
    }
    try { return new RegExp(pattern, flags).test(value); } catch { return false; }
  }

  // --- string.IsNullOrWhitespace / string.IsNullOrWhiteSpace ---
  const nullWsMatch = expr.match(/^string\.IsNullOrWhite[Ss]pace\s*\(\s*(\w+)\s*\)$/);
  if (nullWsMatch) {
    const val = resolveProp(nullWsMatch[1], obj);
    return !val || val.trim().length === 0;
  }

  // --- Name.StartsWith("X") ---
  const swMatch = expr.match(/^(\w+)\.StartsWith\s*\(\s*"([^"]*)"\s*\)$/);
  if (swMatch) {
    return (resolveProp(swMatch[1], obj) || '').startsWith(swMatch[2]);
  }

  // --- Name.EndsWith("X") ---
  const ewMatch = expr.match(/^(\w+)\.EndsWith\s*\(\s*"([^"]*)"\s*\)$/);
  if (ewMatch) {
    return (resolveProp(ewMatch[1], obj) || '').endsWith(ewMatch[2]);
  }

  // --- Name.ToUpper().Contains("X") or Name.ToLower().Contains("X") or Name.Contains("X") ---
  const containsMatch = expr.match(/^(\w+)(?:\.To(?:Upper|Lower)\(\))?\.Contains\s*\(\s*"([^"]*)"\s*\)$/);
  if (containsMatch) {
    const val = resolveProp(containsMatch[1], obj) || '';
    const needle = containsMatch[2];
    if (expr.includes('.ToUpper()')) return val.toUpperCase().includes(needle);
    if (expr.includes('.ToLower()')) return val.toLowerCase().includes(needle);
    return val.includes(needle);
  }

  // --- Name.IndexOf("X", "OrdinalIgnoreCase") >= 0 ---
  const indexOfStrMatch = expr.match(
    /^(\w+)\.IndexOf\s*\(\s*"([^"]*)"\s*(?:,\s*"OrdinalIgnoreCase"\s*)?\)\s*(>=?|<=?|==|!=|<>)\s*(-?\d+)$/i
  );
  if (indexOfStrMatch) {
    const val = resolveProp(indexOfStrMatch[1], obj) || '';
    const needle = indexOfStrMatch[2];
    const isOrdinalIgnore = expr.includes('OrdinalIgnoreCase');
    const idx = isOrdinalIgnore
      ? val.toLowerCase().indexOf(needle.toLowerCase())
      : val.indexOf(needle);
    return compareNum(idx, indexOfStrMatch[3], parseInt(indexOfStrMatch[4]));
  }

  // --- Name.IndexOf(char(9)) > -1 ---
  const indexOfCharMatch = expr.match(/^(\w+)\.IndexOf\s*\(\s*char\s*\(\s*(\d+)\s*\)\s*\)\s*(>=?|<=?|==|!=|<>)\s*(-?\d+)$/i);
  if (indexOfCharMatch) {
    const val = resolveProp(indexOfCharMatch[1], obj) || '';
    const ch = String.fromCharCode(parseInt(indexOfCharMatch[2]));
    return compareNum(val.indexOf(ch), indexOfCharMatch[3], parseInt(indexOfCharMatch[4]));
  }

  // --- Name.ToLower() == "value" / Name.ToLower() = "value" ---
  const toLowerEqMatch = expr.match(/^(\w+)\.ToLower\(\)\s*(==|=|!=|<>)\s*"([^"]*)"$/);
  if (toLowerEqMatch) {
    const val = (resolveProp(toLowerEqMatch[1], obj) || '').toLowerCase();
    const matches = val === toLowerEqMatch[3];
    return (toLowerEqMatch[2] === '=' || toLowerEqMatch[2] === '==') ? matches : !matches;
  }

  // --- Name.Substring(0,1).ToUpper() != Name.Substring(0,1) ---
  const capsMatch = expr.match(
    /^(\w+)\.Substring\s*\(\s*0\s*,\s*1\s*\)\.ToUpper\s*\(\s*\)\s*(!=|<>)\s*\w+\.Substring\s*\(\s*0\s*,\s*1\s*\)$/
  );
  if (capsMatch) {
    const val = resolveProp(capsMatch[1], obj) || '';
    if (val.length === 0) return false;
    return val[0].toUpperCase() !== val[0];
  }

  // --- DataType comparisons: DataType = DataType.X or DataType = "X" ---
  const dtEnumMatch = expr.match(/^DataType\s*(=|==|!=|<>)\s*DataType\.(\w+)$/);
  if (dtEnumMatch) {
    const actual = String(p.DataType || p.dataType || '');
    const matches = actual.toLowerCase().includes(dtEnumMatch[2].toLowerCase());
    return (dtEnumMatch[1] === '=' || dtEnumMatch[1] === '==') ? matches : !matches;
  }

  // --- Enum comparison: Prop == EnumType.Value ---
  const enumMatch = expr.match(/^(\w+)(?:\.ToString\(\))?\s*(=|==|!=|<>)\s*(\w+)\.(\w+)$/);
  if (enumMatch) {
    const actual = String(p[enumMatch[1]] ?? p[enumMatch[1].charAt(0).toLowerCase() + enumMatch[1].slice(1)] ?? '');
    const expected = enumMatch[4];
    const matches = actual === expected;
    return (enumMatch[2] === '=' || enumMatch[2] === '==') ? matches : !matches;
  }

  // --- Prop.ToString() = "Value" ---
  const toStrMatch = expr.match(/^(\w+)\.ToString\s*\(\s*\)\s*(=|==|!=|<>)\s*"([^"]*)"$/);
  if (toStrMatch) {
    const actual = String(p[toStrMatch[1]] ?? p[toStrMatch[1].charAt(0).toLowerCase() + toStrMatch[1].slice(1)] ?? '');
    const matches = actual === toStrMatch[3];
    return (toStrMatch[2] === '=' || toStrMatch[2] === '==') ? matches : !matches;
  }

  // --- ObjectTypeName == "X" ---
  const otnMatch = expr.match(/^ObjectTypeName\s*(==|=)\s*"([^"]*)"$/);
  if (otnMatch) {
    return String(p.ObjectTypeName || '') === otnMatch[2];
  }

  // --- Collection counts: Partitions.Count = N, Columns.Count > N ---
  const countMatch = expr.match(/^(\w+)\.Count\s*(=|==|!=|<>|>=?|<=?)\s*(\d+)$/);
  if (countMatch) {
    const collName = countMatch[1];
    let count = 0;
    if (collName === 'Partitions' || collName === 'partitions') {
      count = Number(p.partitionCount || p.PartitionCount || 0);
    } else if (collName === 'Columns' || collName === 'columns') {
      count = Number(p.columnCount || p.ColumnCount || 0);
    }
    return compareNum(count, countMatch[2], parseInt(countMatch[3]));
  }

  // --- UsedInRelationships.Any() / UsedInRelationships.Count() == 0 ---
  const relCountMatch = expr.match(/^UsedInRelationships\.Count\s*\(\s*\)\s*(=|==|!=|<>|>=?|<=?)\s*(\d+)$/);
  if (relCountMatch) {
    const count = getRelCount(obj, ctx);
    return compareNum(count, relCountMatch[1], parseInt(relCountMatch[2]));
  }
  if (/^UsedInRelationships\.Any\s*\(\s*\)\s*(==\s*false)?$/.test(expr)) {
    const any = getRelCount(obj, ctx) > 0;
    return expr.includes('false') ? !any : any;
  }

  // --- UsedInRelationships.Any(inner predicate) ---
  const relAnyInnerMatch = expr.match(/^UsedInRelationships\.Any\((.+)\)$/);
  if (relAnyInnerMatch) {
    const innerExpr = relAnyInnerMatch[1].trim();
    const objTableName = obj.type === 'Table' || obj.type === 'CalculatedTable'
      ? obj.name
      : String(obj.properties.TableName || obj.properties.tableName || '');
    for (const rel of ctx.allRelationships) {
      const rp = rel.properties;
      const fromTable = String(rp.FromTable || rp.fromTable || '');
      const toTable = String(rp.ToTable || rp.toTable || '');
      const fromCol = String(rp.FromColumn || rp.fromColumn || '');
      const toCol = String(rp.ToColumn || rp.toColumn || '');
      // For columns, check if this column is involved; for tables, check if this table is involved
      let involved = false;
      if (obj.type === 'DataColumn' || obj.type === 'CalculatedColumn') {
        const colName = String(obj.properties.Name || obj.properties.name || '');
        involved = (fromTable === objTableName && fromCol === colName)
                || (toTable === objTableName && toCol === colName);
      } else {
        involved = fromTable === objTableName || toTable === objTableName;
      }
      if (!involved) continue;
      // Evaluate inner predicate against relationship object with 'current' referring to obj
      const relObjWithCurrent: ModelObject = {
        name: rel.name,
        type: 'Relationship',
        properties: { ...rel.properties, current: { Name: objTableName } },
      };
      try {
        if (evaluateExpr(innerExpr, relObjWithCurrent, ctx)) return true;
      } catch { /* skip */ }
    }
    return false;
  }

  // --- ReferencedBy.Count = 0 ---
  // Can't evaluate without full dependency data — skip (return false)

  // --- Boolean property: IsHidden, IsActive, IsKey, IsAvailableInMDX ---
  const boolPropMatch = expr.match(/^(Is\w+)$/);
  if (boolPropMatch) {
    const val = p[boolPropMatch[1]] ?? p[boolPropMatch[1].charAt(0).toLowerCase() + boolPropMatch[1].slice(1)];
    return val === true || val === 'true';
  }

  // --- IsHidden == false / IsActive == false ---
  const boolEqMatch = expr.match(/^(Is\w+)\s*(==|=)\s*(true|false)$/i);
  if (boolEqMatch) {
    const val = p[boolEqMatch[1]] ?? p[boolEqMatch[1].charAt(0).toLowerCase() + boolEqMatch[1].slice(1)];
    const boolVal = val === true || val === 'true';
    return boolEqMatch[3].toLowerCase() === 'true' ? boolVal : !boolVal;
  }

  // --- Table.IsHidden ---
  if (/^Table\.IsHidden$/i.test(expr)) {
    const tableName = String(p.TableName || p.tableName || '');
    const tableObj = ctx.allTables.find((t) => t.name === tableName);
    if (tableObj) {
      const val = tableObj.properties.IsHidden ?? tableObj.properties.isHidden;
      return val === true || val === 'true';
    }
    return false;
  }

  // --- FormatString comparisons ---
  const fmtMatch = expr.match(/^FormatString\s*(=|==|!=|<>)\s*"([^"]*)"$/);
  if (fmtMatch) {
    const actual = String(p.FormatString || p.formatString || '');
    const matches = actual === fmtMatch[2];
    return (fmtMatch[1] === '=' || fmtMatch[1] === '==') ? matches : !matches;
  }
  const fmtContains = expr.match(/^FormatString\.Contains\s*\(\s*"([^"]*)"\s*\)$/);
  if (fmtContains) {
    return String(p.FormatString || p.formatString || '').includes(fmtContains[1]);
  }

  // --- SortByColumn == null ---
  if (/^SortByColumn\s*(==|=)\s*null$/i.test(expr)) {
    const val = p.SortByColumn ?? p.sortByColumn;
    return val === null || val === undefined || val === '';
  }
  if (/^SortByColumn\s*(!=|<>)\s*null$/i.test(expr)) {
    const val = p.SortByColumn ?? p.sortByColumn;
    return val !== null && val !== undefined && val !== '';
  }

  // --- Dot-path property comparison: FromColumn.DataType != ToColumn.DataType ---
  const dotPathCmp = expr.match(/^(\w+)\.(\w+)\s*(=|==|!=|<>)\s*(\w+)\.(\w+)$/);
  if (dotPathCmp) {
    const lhs = String(p[`${dotPathCmp[1]}${dotPathCmp[2]}`] ?? p[dotPathCmp[1] + dotPathCmp[2]] ?? '');
    const rhs = String(p[`${dotPathCmp[4]}${dotPathCmp[5]}`] ?? p[dotPathCmp[4] + dotPathCmp[5]] ?? '');
    const eq = lhs === rhs;
    return (dotPathCmp[3] === '=' || dotPathCmp[3] === '==') ? eq : !eq;
  }

  // --- current.Name == FromTable.Name (relationship predicate referencing 'current') ---
  const currentNameMatch = expr.match(/^current\.Name\s*(==|=)\s*(\w+)\.Name$/);
  if (currentNameMatch) {
    const currentName = String((p.current as Record<string, unknown>)?.Name ?? '');
    const otherProp = currentNameMatch[2] + 'Name'; // e.g. FromTableName
    const otherVal = String(p[otherProp] ?? p[currentNameMatch[2]]?.toString() ?? '');
    return currentName === otherVal;
  }

  // --- FromCardinality / ToCardinality comparisons ---
  const cardMatch = expr.match(/^(FromCardinality|ToCardinality)(?:\.ToString\(\))?\s*(=|==|!=|<>)\s*"?(\w+)"?$/);
  if (cardMatch) {
    const actual = String(p[cardMatch[1]] ?? p[cardMatch[1].charAt(0).toLowerCase() + cardMatch[1].slice(1)] ?? '');
    const expected = cardMatch[3];
    const eq = actual === expected;
    return (cardMatch[2] === '=' || cardMatch[2] === '==') ? eq : !eq;
  }

  // --- Generic property comparison: Prop op "Value" or Prop op Value ---
  const propMatch = expr.match(/^(\w+)\s*(=|==|!=|<>|>=?|<=?)\s*"?([^"]*?)"?\s*$/);
  if (propMatch) {
    const [, propName, operator, value] = propMatch;
    const actual = String(p[propName] ?? p[propName.charAt(0).toLowerCase() + propName.slice(1)] ?? '');
    if (/^\d+$/.test(value)) {
      return compareNum(parseFloat(actual) || 0, operator, parseInt(value));
    }
    switch (operator) {
      case '=': case '==': return actual === value;
      case '!=': case '<>': return actual !== value;
    }
  }

  // Complex expressions we can't evaluate (DependsOn, outerIt, Model.X, etc.)
  return false;
}

function resolveProp(name: string, obj: ModelObject): string {
  const p = obj.properties;
  if (name === 'Expression') return obj.expression || String(p.Expression || p.expression || '');
  if (name === 'Name') return obj.name;
  return String(p[name] ?? p[name.charAt(0).toLowerCase() + name.slice(1)] ?? '');
}

function getRelCount(obj: ModelObject, ctx: AnalysisContext): number {
  const name = obj.name;
  if (obj.type === 'Table' || obj.type === 'CalculatedTable') {
    return ctx.tableRelCounts.get(name) || 0;
  }
  if (obj.type === 'DataColumn' || obj.type === 'CalculatedColumn') {
    return ctx.columnInRel.has(`${obj.properties.TableName || obj.properties.tableName}[${obj.properties.Name || obj.properties.name}]`) ? 1 : 0;
  }
  return 0;
}

function compareNum(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case '=': case '==': return actual === expected;
    case '!=': case '<>': return actual !== expected;
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    default: return false;
  }
}

// ─── DAX-Based Rule Evaluation ───────────────────────────────────────

async function evaluateDaxRules(
  rules: Array<{ ID: string; Name: string; Category: string; Severity: number; Description: string; FixExpression?: string }>,
  existingFindings: RuleEvaluation[],
  log: ReturnType<typeof childLogger>,
): Promise<RuleEvaluation[]> {
  const client = getMcpClient();
  if (!client) return [];

  const daxQueries = loadDaxRuleQueries();
  if (daxQueries.length === 0) return [];

  // Only run DAX rules that weren't already caught by expression evaluator
  const existingRuleObjects = new Set(existingFindings.map((f) => `${f.ruleId}::${f.affectedObject}`));
  const ruleMap = new Map(rules.map((r) => [r.ID, r]));
  const findings: RuleEvaluation[] = [];

  for (const dq of daxQueries) {
    const rule = ruleMap.get(dq.ruleId);
    if (!rule) continue;

    try {
      const result = await client.callTool({
        name: 'dax_query_operations',
        arguments: { request: { operation: 'Execute', query: dq.query } },
      });

      const parsed = parseToolResultRaw(result);
      if (!parsed) continue;

      const data = parsed.data ?? parsed;
      const rows: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : (data as Record<string, unknown>).rows as Array<Record<string, unknown>> ?? [];

      if (dq.threshold !== undefined) {
        // Aggregate rule: check if count exceeds threshold
        if (rows.length > 0) {
          const count = Number(Object.values(rows[0])[0] ?? 0);
          if (count > dq.threshold) {
            const key = `${dq.ruleId}::Model`;
            if (!existingRuleObjects.has(key)) {
              findings.push({
                ruleId: rule.ID,
                ruleName: rule.Name,
                category: rule.Category,
                severity: rule.Severity,
                description: rule.Description || '',
                affectedObject: 'Model',
                objectType: 'Model',
                hasAutoFix: !!rule.FixExpression,
              });
            }
          }
        }
      } else {
        for (const row of rows) {
          const rr = row as Record<string, unknown>;
          const tableName = getPropStr(rr, dq.mapResult.tableName ?? '', 'tableName', 'TableName', 'name', 'Name');
          const objName = getPropStr(
            rr,
            dq.mapResult.measureName ?? '', dq.mapResult.columnName ?? '', dq.mapResult.tableName ?? '',
            'name', 'Name', 'measureName', 'columnName',
          );
          const affectedObject = tableName && objName && objName !== tableName
            ? `'${tableName}'[${objName}]`
            : tableName || objName || `Unknown_${dq.objectType}`;

          const key = `${dq.ruleId}::${affectedObject}`;
          if (existingRuleObjects.has(key)) continue;

          findings.push({
            ruleId: rule.ID,
            ruleName: rule.Name,
            category: rule.Category,
            severity: rule.Severity,
            description: rule.Description || '',
            affectedObject,
            objectType: dq.objectType,
            hasAutoFix: !!rule.FixExpression,
          });
          existingRuleObjects.add(key);
        }
      }
    } catch (err) {
      log.warn({ err, ruleId: dq.ruleId }, 'DAX rule query failed, skipping');
    }
  }

  return findings;
}

export async function runAnalysis(): Promise<string> {
  const connStatus = getConnectionStatus();
  if (!connStatus.connected) {
    throw Object.assign(new Error('No model connected'), { statusCode: 422 });
  }

  const run = await prisma.analysisRun.create({
    data: {
      modelName: connStatus.databaseName || 'Unknown',
      serverAddress: connStatus.serverAddress || '',
      databaseName: connStatus.databaseName || '',
      status: 'RUNNING',
    },
  });

  const log = childLogger({ analysisRunId: run.id });

  // Run analysis asynchronously
  processAnalysis(run.id, log).catch((err) => {
    log.error({ err }, 'Analysis failed');
  });

  return run.id;
}

async function processAnalysis(runId: string, log: ReturnType<typeof childLogger>): Promise<void> {
  try {
    log.info('Starting analysis');

    const [metadata, rules] = await Promise.all([fetchModelMetadata(), getRawRules()]);

    log.info({ objectCount: metadata.length, ruleCount: rules.length }, 'Metadata and rules loaded');

    // Build analysis context for cross-referencing
    const ctx: AnalysisContext = {
      tableRelCounts: new Map(),
      columnInRel: new Set(),
      allTables: metadata.filter((o) => o.type === 'Table' || o.type === 'CalculatedTable'),
      allMeasures: metadata.filter((o) => o.type === 'Measure'),
      allColumns: metadata.filter((o) => o.type === 'DataColumn' || o.type === 'CalculatedColumn'),
      allRelationships: metadata.filter((o) => o.type === 'Relationship'),
    };

    // Build relationship cross-reference maps
    for (const rel of ctx.allRelationships) {
      const rp = rel.properties;
      const fromTable = String(rp.FromTable || rp.fromTable || '');
      const toTable = String(rp.ToTable || rp.toTable || '');
      const fromCol = String(rp.FromColumn || rp.fromColumn || '');
      const toCol = String(rp.ToColumn || rp.toColumn || '');

      ctx.tableRelCounts.set(fromTable, (ctx.tableRelCounts.get(fromTable) || 0) + 1);
      ctx.tableRelCounts.set(toTable, (ctx.tableRelCounts.get(toTable) || 0) + 1);
      if (fromCol) ctx.columnInRel.add(`${fromTable}[${fromCol}]`);
      if (toCol) ctx.columnInRel.add(`${toTable}[${toCol}]`);
    }

    const allFindings: RuleEvaluation[] = [];
    for (const rule of rules) {
      try {
        const ruleFindings = evaluateRule(rule, metadata, ctx);
        allFindings.push(...ruleFindings);
      } catch (err) {
        log.warn({ err, ruleId: rule.ID }, 'Rule evaluation failed, skipping');
      }
    }

    log.info({ findingsCount: allFindings.length }, 'Rule evaluation complete');

    // --- DAX-based rule evaluation (supplemental) ---
    const daxFindings = await evaluateDaxRules(rules, allFindings, log);
    allFindings.push(...daxFindings);
    if (daxFindings.length > 0) {
      log.info({ daxFindingsCount: daxFindings.length }, 'DAX-based rule evaluation added findings');
    }

    // Insert findings in batch — ensure affectedObject is never empty
    if (allFindings.length > 0) {
      await prisma.finding.createMany({
        data: allFindings.map((f) => ({
          analysisRunId: runId,
          ruleId: f.ruleId,
          ruleName: f.ruleName,
          category: f.category,
          severity: f.severity,
          description: f.description,
          affectedObject: f.affectedObject || `Unknown_${f.objectType}`,
          objectType: f.objectType || 'Unknown',
          hasAutoFix: f.hasAutoFix,
        })),
      });
    }

    const errorCount = allFindings.filter((f) => f.severity === 3).length;
    const warningCount = allFindings.filter((f) => f.severity === 2).length;
    const infoCount = allFindings.filter((f) => f.severity === 1).length;

    await prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        errorCount,
        warningCount,
        infoCount,
      },
    });

    log.info({ errorCount, warningCount, infoCount }, 'Analysis completed');
  } catch (err) {
    log.error({ err }, 'Analysis processing failed');
    await prisma.analysisRun.update({
      where: { id: runId },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }
}

export async function getAnalysisRun(runId: string) {
  return prisma.analysisRun.findUnique({
    where: { id: runId },
    include: { findings: true },
  });
}

export async function listAnalysisRuns(limit: number, offset: number) {
  const [runs, total] = await Promise.all([
    prisma.analysisRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.analysisRun.count(),
  ]);
  return { runs, total };
}

export async function getFindings(
  runId: string,
  filters: {
    severity?: number;
    category?: string;
    fixStatus?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  },
) {
  const where: Record<string, unknown> = { analysisRunId: runId };
  if (filters.severity) where.severity = filters.severity;
  if (filters.category) where.category = filters.category;
  if (filters.fixStatus) where.fixStatus = filters.fixStatus;

  const orderBy: Record<string, string> = {};
  orderBy[filters.sortBy || 'severity'] = filters.sortOrder || 'desc';

  const [findings, total] = await Promise.all([
    prisma.finding.findMany({
      where,
      orderBy,
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.finding.count({ where }),
  ]);

  // Compute summary
  const allFindings = await prisma.finding.findMany({
    where: { analysisRunId: runId },
    select: { severity: true, fixStatus: true },
  });

  const summary = {
    totalCount: allFindings.length,
    errorCount: allFindings.filter((f) => f.severity === 3).length,
    warningCount: allFindings.filter((f) => f.severity === 2).length,
    infoCount: allFindings.filter((f) => f.severity === 1).length,
    fixedCount: allFindings.filter((f) => f.fixStatus === 'FIXED').length,
    unfixedCount: allFindings.filter((f) => f.fixStatus === 'UNFIXED').length,
  };

  return { findings, summary, total };
}

export async function getFinding(findingId: string) {
  return prisma.finding.findUnique({
    where: { id: findingId },
    include: { fixSession: true },
  });
}

export async function compareRuns(currentRunId: string, previousRunId: string) {
  const [currentFindings, previousFindings] = await Promise.all([
    prisma.finding.findMany({ where: { analysisRunId: currentRunId } }),
    prisma.finding.findMany({ where: { analysisRunId: previousRunId } }),
  ]);

  const prevKeys = new Set(
    previousFindings.map((f) => `${f.ruleId}::${f.affectedObject}`),
  );
  const currKeys = new Set(
    currentFindings.map((f) => `${f.ruleId}::${f.affectedObject}`),
  );

  const resolved = previousFindings.filter(
    (f) => !currKeys.has(`${f.ruleId}::${f.affectedObject}`),
  );
  const newFindings = currentFindings.filter(
    (f) => !prevKeys.has(`${f.ruleId}::${f.affectedObject}`),
  );
  const recurring = currentFindings.filter((f) =>
    prevKeys.has(`${f.ruleId}::${f.affectedObject}`),
  );

  return {
    resolvedCount: resolved.length,
    newCount: newFindings.length,
    recurringCount: recurring.length,
    resolved: resolved.map((f) => ({ ruleId: f.ruleId, ruleName: f.ruleName, affectedObject: f.affectedObject })),
    new: newFindings.map((f) => ({ ruleId: f.ruleId, ruleName: f.ruleName, affectedObject: f.affectedObject })),
  };
}
