import prisma from '../models/prisma.js';
import { getRawRules } from './rules.service.js';
import { childLogger } from '../middleware/logger.js';
import { generateFixScript, generateBulkFixScript, runTabularEditorScript } from './tabular-editor.service.js';
import { getConnectionStatus } from '../mcp/client.js';

// ── Tabular Editor Fix (per-finding) ──

export async function applyTeFix(findingId: string): Promise<{ findingId: string; status: string; fixSummary: string }> {
  const finding = await prisma.finding.findUnique({ where: { id: findingId } });
  if (!finding) {
    throw Object.assign(new Error('Finding not found'), { statusCode: 404 });
  }

  if (finding.fixStatus === 'FIXED') {
    throw Object.assign(new Error('Finding is already fixed'), { statusCode: 409 });
  }

  if (!finding.hasAutoFix) {
    throw Object.assign(new Error('This finding does not have an auto-fix expression'), { statusCode: 422 });
  }

  const connStatus = getConnectionStatus();
  if (!connStatus.connected) {
    throw Object.assign(new Error('No model connected'), { statusCode: 422 });
  }

  // Look up the FixExpression from the rule definitions
  const rules = await getRawRules();
  const rule = rules.find((r) => r.ID === finding.ruleId);
  if (!rule?.FixExpression) {
    throw Object.assign(new Error(`No FixExpression found for rule: ${finding.ruleId}`), { statusCode: 422 });
  }

  const log = childLogger({ findingId, ruleId: finding.ruleId });
  log.info({ affectedObject: finding.affectedObject, objectType: finding.objectType }, 'Applying TE fix');

  // Mark as in-progress
  await prisma.finding.update({
    where: { id: findingId },
    data: { fixStatus: 'IN_PROGRESS' },
  });

  try {
    const script = generateFixScript(finding.objectType, finding.affectedObject, rule.FixExpression);
    log.info({ script }, 'Generated fix script');

    const serverAddress = connStatus.serverAddress!;
    const databaseName = connStatus.catalogName || connStatus.databaseName!;

    const { stdout, stderr } = await runTabularEditorScript(serverAddress, databaseName, script);

    if (stderr) {
      log.warn({ stderr: stderr.substring(0, 500) }, 'TE fix stderr output');
    }

    const summary = `Fixed via Tabular Editor: ${rule.FixExpression}`;
    await prisma.finding.update({
      where: { id: findingId },
      data: { fixStatus: 'FIXED', fixSummary: summary },
    });

    log.info({ stdout: stdout.substring(0, 200) }, 'TE fix applied successfully');
    return { findingId, status: 'FIXED', fixSummary: summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await prisma.finding.update({
      where: { id: findingId },
      data: { fixStatus: 'FAILED', fixSummary: `TE fix failed: ${message}` },
    });
    log.error({ err }, 'TE fix failed');
    throw Object.assign(new Error(`TE fix failed: ${message}`), { statusCode: 500 });
  }
}

// ── Tabular Editor Bulk Fix (per-rule) ──

export async function applyBulkTeFix(
  ruleId: string,
  analysisRunId: string,
): Promise<{ ruleId: string; fixedCount: number; skippedCount: number; failedCount: number; status: string }> {
  const findings = await prisma.finding.findMany({
    where: { ruleId, analysisRunId, fixStatus: 'UNFIXED', hasAutoFix: true },
  });

  if (findings.length === 0) {
    throw Object.assign(new Error('No unfixed findings with auto-fix for this rule'), { statusCode: 404 });
  }

  const connStatus = getConnectionStatus();
  if (!connStatus.connected) {
    throw Object.assign(new Error('No model connected'), { statusCode: 422 });
  }

  const rules = await getRawRules();
  const rule = rules.find((r) => r.ID === ruleId);
  if (!rule?.FixExpression) {
    throw Object.assign(new Error(`No FixExpression found for rule: ${ruleId}`), { statusCode: 422 });
  }

  const log = childLogger({ ruleId, analysisRunId });
  log.info({ findingCount: findings.length }, 'Starting bulk TE fix');

  const { script, skippedIndices } = generateBulkFixScript(
    findings.map((f) => ({ objectType: f.objectType, affectedObject: f.affectedObject })),
    rule.FixExpression,
  );

  const fixableFindings = findings.filter((_, i) => !skippedIndices.includes(i));
  const skippedFindings = findings.filter((_, i) => skippedIndices.includes(i));

  // Mark fixable as IN_PROGRESS
  if (fixableFindings.length > 0) {
    await prisma.finding.updateMany({
      where: { id: { in: fixableFindings.map((f) => f.id) } },
      data: { fixStatus: 'IN_PROGRESS' },
    });
  }

  // Mark skipped as FAILED immediately
  if (skippedFindings.length > 0) {
    await prisma.finding.updateMany({
      where: { id: { in: skippedFindings.map((f) => f.id) } },
      data: { fixStatus: 'FAILED', fixSummary: 'Unsupported object type for TE fix' },
    });
  }

  try {
    const serverAddress = connStatus.serverAddress!;
    const databaseName = connStatus.catalogName || connStatus.databaseName!;

    log.info({ scriptLength: script.length, fixableCount: fixableFindings.length }, 'Running bulk TE fix script');
    const { stderr } = await runTabularEditorScript(serverAddress, databaseName, script);

    if (stderr) {
      log.warn({ stderr: stderr.substring(0, 500) }, 'Bulk TE fix stderr output');
    }

    const summary = `Fixed via Tabular Editor: ${rule.FixExpression}`;
    await prisma.finding.updateMany({
      where: { id: { in: fixableFindings.map((f) => f.id) } },
      data: { fixStatus: 'FIXED', fixSummary: summary },
    });

    log.info({ fixedCount: fixableFindings.length, skippedCount: skippedFindings.length }, 'Bulk TE fix completed');
    return {
      ruleId,
      fixedCount: fixableFindings.length,
      skippedCount: skippedFindings.length,
      failedCount: 0,
      status: 'COMPLETED',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await prisma.finding.updateMany({
      where: { id: { in: fixableFindings.map((f) => f.id) }, fixStatus: 'IN_PROGRESS' },
      data: { fixStatus: 'FAILED', fixSummary: `TE bulk fix failed: ${message}` },
    });
    log.error({ err }, 'Bulk TE fix failed');
    throw Object.assign(new Error(`Bulk TE fix failed: ${message}`), { statusCode: 500 });
  }
}


