import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
import { getRawRules } from './rules.service.js';
import { getConnectionStatus } from '../mcp/client.js';
import { childLogger } from '../middleware/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── DAX Rule Query Loading ──────────────────────────────────────────

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

// ─── MCP Response Parsing ────────────────────────────────────────────

function parseDaxResult(result: unknown): Array<Record<string, unknown>> | null {
  if ((result as { isError?: boolean })?.isError) return null;
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (!content || content.length === 0 || !content[0].text) return null;
  try {
    const parsed = JSON.parse(content[0].text);
    if (parsed && parsed.success === false) return null;
    const data = parsed.data ?? parsed;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && typeof data === 'object') return [data];
    return null;
  } catch {
    return null;
  }
}

function getPropStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (val !== null && val !== undefined && val !== '') return String(val);
  }
  return '';
}

// ─── Rule Evaluation via DAX Queries ─────────────────────────────────

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

const BATCH_SIZE = 5;

async function evaluateRules(
  rules: Array<{ ID: string; Name: string; Category: string; Severity: number; Description: string; FixExpression?: string }>,
  log: ReturnType<typeof childLogger>,
): Promise<RuleEvaluation[]> {
  const client = getMcpClient();
  if (!client) throw new Error('Not connected to a model');

  const daxQueries = loadDaxRuleQueries();
  if (daxQueries.length === 0) {
    log.warn('No DAX rule queries found');
    return [];
  }

  const ruleMap = new Map(rules.map((r) => [r.ID, r]));
  const findings: RuleEvaluation[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < daxQueries.length; i += BATCH_SIZE) {
    const batch = daxQueries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((dq) =>
        client.callTool({
          name: 'dax_query_operations',
          arguments: { request: { operation: 'Execute', query: dq.query } },
        }).then((result) => ({ dq, result })),
      ),
    );

    for (const settled of results) {
      if (settled.status === 'rejected') continue;
      const { dq, result } = settled.value;
      const rule = ruleMap.get(dq.ruleId);
      if (!rule) continue;

      try {
        const rows = parseDaxResult(result);
        if (!rows) continue;

        if (dq.threshold !== undefined) {
          if (rows.length > 0) {
            const count = Number(Object.values(rows[0])[0] ?? 0);
            if (count > dq.threshold) {
              const key = `${dq.ruleId}::Model`;
              if (!seenKeys.has(key)) {
                findings.push({
                  ruleId: rule.ID,
                  ruleName: rule.Name,
                  category: rule.Category,
                  severity: rule.Severity,
                  description: rule.Description || '',
                  affectedObject: 'Model',
                  objectType: 'Model',
                  hasAutoFix: true,
                });
                seenKeys.add(key);
              }
            }
          }
        } else {
          for (const row of rows) {
            const rr = row as Record<string, unknown>;
            const tableName = getPropStr(rr, dq.mapResult.tableName ?? '', dq.mapResult.fromTable ?? '', 'tableName', 'TableName', 'name', 'Name');
            const objName = getPropStr(
              rr,
              dq.mapResult.measureName ?? '', dq.mapResult.columnName ?? '', dq.mapResult.tableName ?? '',
              'name', 'Name', 'measureName', 'columnName',
            );
            const affectedObject = tableName && objName && objName !== tableName
              ? `'${tableName}'[${objName}]`
              : tableName || objName || `Unknown_${dq.objectType}`;

            const key = `${dq.ruleId}::${affectedObject}`;
            if (seenKeys.has(key)) continue;

            findings.push({
              ruleId: rule.ID,
              ruleName: rule.Name,
              category: rule.Category,
              severity: rule.Severity,
              description: rule.Description || '',
              affectedObject,
              objectType: dq.objectType,
              hasAutoFix: true,
            });
            seenKeys.add(key);
          }
        }
      } catch (err) {
        log.warn({ err, ruleId: dq.ruleId }, 'DAX rule query failed, skipping');
      }
    }
  }

  return findings;
}

// ─── Analysis Orchestration ──────────────────────────────────────────

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

  processAnalysis(run.id, log).catch((err) => {
    log.error({ err }, 'Analysis failed');
  });

  return run.id;
}

async function processAnalysis(runId: string, log: ReturnType<typeof childLogger>): Promise<void> {
  try {
    log.info('Starting analysis');
    const rules = await getRawRules();
    log.info({ ruleCount: rules.length }, 'Rules loaded');

    const allFindings = await evaluateRules(rules, log);
    log.info({ findingsCount: allFindings.length }, 'Rule evaluation complete');

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

// ─── Query Helpers ───────────────────────────────────────────────────

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

// ─── Recheck Individual Finding ──────────────────────────────────────

export async function recheckFinding(findingId: string) {
  const finding = await prisma.finding.findUnique({ where: { id: findingId } });
  if (!finding) throw Object.assign(new Error('Finding not found'), { statusCode: 404 });

  const connStatus = getConnectionStatus();
  if (!connStatus.connected) {
    throw Object.assign(new Error('No model connected'), { statusCode: 422 });
  }

  const client = getMcpClient();
  if (!client) throw Object.assign(new Error('Not connected to a model'), { statusCode: 422 });

  const daxQueries = loadDaxRuleQueries();
  const dq = daxQueries.find((q) => q.ruleId === finding.ruleId);
  if (!dq) {
    throw Object.assign(new Error('No DAX query found for this rule'), { statusCode: 422 });
  }

  const result = await client.callTool({
    name: 'dax_query_operations',
    arguments: { request: { operation: 'Execute', query: dq.query } },
  });

  const rows = parseDaxResult(result);
  let stillPresent = false;

  if (rows && rows.length > 0) {
    if (dq.threshold !== undefined) {
      const count = Number(Object.values(rows[0])[0] ?? 0);
      stillPresent = count > dq.threshold;
    } else {
      for (const row of rows) {
        const rr = row as Record<string, unknown>;
        const tableName = getPropStr(rr, dq.mapResult.tableName ?? '', dq.mapResult.fromTable ?? '', 'tableName', 'TableName', 'name', 'Name');
        const objName = getPropStr(
          rr,
          dq.mapResult.measureName ?? '', dq.mapResult.columnName ?? '', dq.mapResult.tableName ?? '',
          'name', 'Name', 'measureName', 'columnName',
        );
        const affectedObject = tableName && objName && objName !== tableName
          ? `'${tableName}'[${objName}]`
          : tableName || objName || `Unknown_${dq.objectType}`;

        if (affectedObject === finding.affectedObject) {
          stillPresent = true;
          break;
        }
      }
    }
  }

  const newStatus = stillPresent ? 'UNFIXED' : 'FIXED';
  const updated = await prisma.finding.update({
    where: { id: findingId },
    data: {
      fixStatus: newStatus,
      ...(newStatus === 'FIXED' && !finding.fixSummary ? { fixSummary: 'Verified fixed via recheck' } : {}),
    },
  });

  return { ...updated, resolved: !stillPresent };
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
