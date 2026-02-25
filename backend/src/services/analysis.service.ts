import prisma from '../models/prisma.js';
import { getRawRules } from './rules.service.js';
import { getConnectionStatus } from '../mcp/client.js';
import { childLogger } from '../middleware/logger.js';
import { evaluateRulesWithTabularEditor, validateTabularEditorPath } from './tabular-editor.service.js';

// ─── Analysis Orchestration ──────────────────────────────────────────

export async function runAnalysis(): Promise<string> {
  const connStatus = getConnectionStatus();
  if (!connStatus.connected) {
    throw Object.assign(new Error('No model connected'), { statusCode: 422 });
  }

  // Validate TE path early, before creating the analysis run record
  await validateTabularEditorPath();

  const catalogName = connStatus.catalogName || connStatus.databaseName || '';
  const modelName = connStatus.databaseName || 'Unknown';

  // Ensure SemanticModel exists (idempotent)
  await prisma.semanticModel.upsert({
    where: { databaseName: catalogName },
    update: { modelName, serverAddress: connStatus.serverAddress || '', updatedAt: new Date() },
    create: { databaseName: catalogName, modelName, serverAddress: connStatus.serverAddress || '' },
  });

  const run = await prisma.analysisRun.create({
    data: {
      modelDatabaseName: catalogName,
      modelName,
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

    const run = await prisma.analysisRun.findUnique({
      where: { id: runId },
      include: { semanticModel: true },
    });
    if (!run) throw new Error(`Analysis run ${runId} not found`);

    const rules = await getRawRules();
    log.info({ ruleCount: rules.length }, 'Rules loaded');

    const allFindings = await evaluateRulesWithTabularEditor(
      run.semanticModel.serverAddress,
      run.semanticModel.databaseName,
      rules,
      log,
    );
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorType = errorMessage.includes('timed out') ? 'timeout'
      : errorMessage.includes('not found at') ? 'not_found'
      : errorMessage.includes('not configured') ? 'misconfigured'
      : 'crash';
    log.error({ err, errorType }, 'Analysis processing failed');
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
    include: { findings: true, semanticModel: true },
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
    include: { autofixRuns: { orderBy: { startedAt: 'desc' } } },
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

  const log = childLogger({ findingId, ruleId: finding.ruleId });
  const rules = await getRawRules();

  const allFindings = await evaluateRulesWithTabularEditor(
    connStatus.serverAddress || '',
    connStatus.catalogName || connStatus.databaseName || '',
    rules,
    log,
  );

  const stillPresent = allFindings.some(
    (f) => f.ruleId === finding.ruleId && f.affectedObject === finding.affectedObject,
  );

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
