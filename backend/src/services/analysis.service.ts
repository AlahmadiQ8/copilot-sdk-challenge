import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
import { getRawRules } from './rules.service.js';
import { getConnectionStatus } from '../mcp/client.js';
import { logger, childLogger } from '../middleware/logger.js';

interface ModelObject {
  name: string;
  type: string;
  properties: Record<string, unknown>;
  expression?: string;
}

async function fetchModelMetadata(): Promise<ModelObject[]> {
  const client = getMcpClient();
  if (!client) throw new Error('Not connected to a model');

  const objects: ModelObject[] = [];

  // Fetch tables
  const tablesResult = await client.callTool({
    name: 'table_operations',
    arguments: { request: { operation: 'List' } },
  });
  const tables = parseToolResult(tablesResult);
  for (const table of tables) {
    objects.push({
      name: String(table.Name || table.name || ''),
      type: 'Table',
      properties: table,
    });
  }

  // Fetch columns — MCP returns grouped by table: { tableName, columns: [...] }
  const columnsResult = await client.callTool({
    name: 'column_operations',
    arguments: { request: { operation: 'List' } },
  });
  const columnGroups = parseToolResult(columnsResult);
  for (const group of columnGroups) {
    const tableName = String(group.tableName || group.TableName || '');
    const cols = Array.isArray(group.columns) ? group.columns as Record<string, unknown>[] : [group];
    for (const col of cols) {
      objects.push({
        name: `'${tableName}'[${col.name || col.Name}]`,
        type: (col.isCalculated || col.Type === 'Calculated') ? 'CalculatedColumn' : 'DataColumn',
        properties: { ...col, TableName: tableName, DataType: col.dataType || col.DataType },
        expression: String(col.expression || col.Expression || ''),
      });
    }
  }

  // Fetch measures — MCP returns flat list with name, displayFolder
  const measuresResult = await client.callTool({
    name: 'measure_operations',
    arguments: { request: { operation: 'List' } },
  });
  const measures = parseToolResult(measuresResult);
  for (const m of measures) {
    const tableName = String(m.TableName || m.tableName || '');
    objects.push({
      name: tableName ? `'${tableName}'[${m.Name || m.name}]` : `[${m.Name || m.name}]`,
      type: 'Measure',
      properties: m,
      expression: String(m.Expression || m.expression || ''),
    });
  }

  // Fetch relationships — MCP returns fromTable/toTable (lowercase)
  const relsResult = await client.callTool({
    name: 'relationship_operations',
    arguments: { request: { operation: 'List' } },
  });
  const rels = parseToolResult(relsResult);
  for (const r of rels) {
    objects.push({
      name: String(r.name || r.Name || `${r.fromTable || r.FromTable}->${r.toTable || r.ToTable}`),
      type: 'Relationship',
      properties: r,
    });
  }

  return objects;
}

function parseToolResult(result: unknown): Array<Record<string, unknown>> {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (!content || content.length === 0 || !content[0].text) return [];
  try {
    const parsed = JSON.parse(content[0].text);
    // MCP tools return { success, data: [...] } — unwrap the data array
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    return [parsed];
  } catch {
    return [];
  }
}

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
): RuleEvaluation[] {
  const findings: RuleEvaluation[] = [];
  const scopes = rule.Scope.split(',').map((s) => s.trim());

  // Filter objects that match the rule's scope
  const scopeMap: Record<string, string[]> = {
    Table: ['Table'],
    Measure: ['Measure'],
    DataColumn: ['DataColumn'],
    CalculatedColumn: ['CalculatedColumn'],
    Column: ['DataColumn', 'CalculatedColumn'],
    Relationship: ['Relationship'],
    Model: ['Model'],
    Partition: ['Partition'],
  };

  const targetTypes = scopes.flatMap((s) => scopeMap[s] || [s]);
  const targetObjects = objects.filter((o) => targetTypes.includes(o.type));

  const expr = rule.Expression;

  for (const obj of targetObjects) {
    let violated = false;

    try {
      violated = evaluateExpression(expr, obj);
    } catch {
      // If we can't evaluate the expression, skip this rule for this object
      continue;
    }

    if (violated) {
      findings.push({
        ruleId: rule.ID,
        ruleName: rule.Name,
        category: rule.Category,
        severity: rule.Severity,
        description: rule.Description,
        affectedObject: obj.name,
        objectType: obj.type,
        hasAutoFix: !!rule.FixExpression,
      });
    }
  }

  return findings;
}

function evaluateExpression(expr: string, obj: ModelObject): boolean {
  const props = obj.properties;

  // DataType check: DataType = DataType.X (must be before generic property check)
  const dataTypeMatch = expr.match(/DataType\s*=\s*DataType\.(\w+)/);
  if (dataTypeMatch) {
    const expectedType = dataTypeMatch[1];
    const actualType = String(props.DataType || props.dataType || '');
    return actualType.includes(expectedType);
  }

  // Regex-based DAX check: RegEx.IsMatch(Expression, "pattern")
  const regexMatch = expr.match(/RegEx\.IsMatch\s*\(\s*Expression\s*,\s*"([^"]+)"\s*\)/i);
  if (regexMatch) {
    const pattern = regexMatch[1];
    const daxExpr = obj.expression || String(props.Expression || props.expression || '');
    if (!daxExpr) return false;
    try {
      return new RegExp(pattern, 'i').test(daxExpr);
    } catch {
      return false;
    }
  }

  // Property check patterns: PropertyName = "Value" or PropertyName == value
  const propCheckMatch = expr.match(
    /^(\w+)\s*(=|==|!=|<>)\s*"?([^"]*)"?\s*$/,
  );
  if (propCheckMatch) {
    const [, propName, operator, value] = propCheckMatch;
    const actualValue = String(props[propName] ?? '');
    switch (operator) {
      case '=':
      case '==':
        return actualValue === value;
      case '!=':
      case '<>':
        return actualValue !== value;
    }
  }

  // IsHidden check
  if (expr.includes('IsHidden') && expr.includes('false')) {
    return props.IsHidden === false || props.isHidden === false;
  }
  if (expr.includes('IsHidden') && expr.includes('true')) {
    return props.IsHidden === true || props.isHidden === true;
  }

  // SummarizeBy check
  const summarizeMatch = expr.match(/SummarizeBy\s*(<>|!=|==|=)\s*"?(\w+)"?/);
  if (summarizeMatch) {
    const [, op, val] = summarizeMatch;
    const actual = String(props.SummarizeBy || props.summarizeBy || '');
    if (op === '<>' || op === '!=') return actual !== val;
    return actual === val;
  }

  // FormatString check
  if (expr.includes('FormatString') && expr.includes('""')) {
    const fmt = String(props.FormatString || props.formatString || '');
    return fmt === '' || fmt === undefined;
  }

  // Expression is empty check (for measures without expressions)
  if (expr.includes('Expression') && (expr.includes('""') || expr.includes('.Length'))) {
    const daxExpr = obj.expression || String(props.Expression || props.expression || '');
    return !daxExpr || daxExpr.trim().length === 0;
  }

  // Fallback: cannot evaluate this expression type
  return false;
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

    const allFindings: RuleEvaluation[] = [];
    for (const rule of rules) {
      const ruleFindings = evaluateRule(rule, metadata);
      allFindings.push(...ruleFindings);
    }

    log.info({ findingsCount: allFindings.length }, 'Rule evaluation complete');

    // Insert findings in batch
    if (allFindings.length > 0) {
      await prisma.finding.createMany({
        data: allFindings.map((f) => ({
          analysisRunId: runId,
          ruleId: f.ruleId,
          ruleName: f.ruleName,
          category: f.category,
          severity: f.severity,
          description: f.description,
          affectedObject: f.affectedObject,
          objectType: f.objectType,
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
