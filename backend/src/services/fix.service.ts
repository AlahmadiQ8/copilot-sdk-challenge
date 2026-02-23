import { CopilotClient, SessionEvent } from '@github/copilot-sdk';
import prisma from '../models/prisma.js';
import { getRawRules } from './rules.service.js';
import { childLogger } from '../middleware/logger.js';
import { generateFixScript, generateBulkFixScript, runTabularEditorScript } from './tabular-editor.service.js';
import { getConnectionStatus } from '../mcp/client.js';

type StepEventType = 'reasoning' | 'tool_call' | 'tool_result' | 'message' | 'error';

interface FixStepCallback {
  (step: { eventType: StepEventType; content: string; stepNumber: number }): void;
}

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

// ── Bulk Fix (rule-level) ──

export async function triggerBulkFix(
  ruleId: string,
  analysisRunId: string,
  onStep?: FixStepCallback,
): Promise<string> {
  // Find all UNFIXED findings for this rule in this run
  const findings = await prisma.finding.findMany({
    where: {
      ruleId,
      analysisRunId,
      fixStatus: 'UNFIXED',
    },
  });

  if (findings.length === 0) {
    throw Object.assign(new Error('No unfixed findings for this rule'), { statusCode: 404 });
  }

  // Create bulk fix session
  const session = await prisma.bulkFixSession.create({
    data: {
      ruleId,
      analysisRunId,
      status: 'RUNNING',
      totalFindings: findings.length,
    },
  });

  // Mark all findings as in progress
  await prisma.finding.updateMany({
    where: { id: { in: findings.map((f) => f.id) } },
    data: { fixStatus: 'IN_PROGRESS' },
  });

  const log = childLogger({ bulkFixSessionId: session.id, ruleId });

  // Run bulk fix asynchronously
  processBulkFix(session.id, findings, onStep, log).catch((err) => {
    log.error({ err }, 'Bulk fix processing failed');
  });

  return session.id;
}

async function processBulkFix(
  sessionId: string,
  findings: Array<{
    id: string;
    ruleId: string;
    ruleName: string;
    description: string;
    affectedObject: string;
    objectType: string;
    hasAutoFix: boolean;
  }>,
  onStep: FixStepCallback | undefined,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  let stepNumber = 0;

  const addStep = async (eventType: StepEventType, content: string) => {
    stepNumber++;
    await prisma.bulkFixSessionStep.create({
      data: {
        bulkFixSessionId: sessionId,
        stepNumber,
        eventType,
        content,
      },
    });
    onStep?.({ eventType, content, stepNumber });
  };

  try {
    const first = findings[0];
    const rules = await getRawRules();
    const rule = rules.find((r) => r.ID === first.ruleId);
    const fixHint = rule?.FixExpression || null;

    await addStep(
      'reasoning',
      `Bulk fixing ${findings.length} violations of rule ${first.ruleId}${fixHint ? ` (hint: ${fixHint})` : ''}`,
    );

    await applyBulkAiFix(sessionId, findings, fixHint, addStep, log);

    // Mark all findings as fixed
    let fixedCount = 0;
    for (const f of findings) {
      try {
        await prisma.finding.update({
          where: { id: f.id },
          data: { fixStatus: 'FIXED', fixSummary: 'Fixed via bulk AI agent' },
        });
        fixedCount++;
      } catch {
        await prisma.finding.update({
          where: { id: f.id },
          data: { fixStatus: 'FAILED', fixSummary: 'Bulk fix: update failed' },
        });
      }
    }

    await prisma.bulkFixSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        fixedCount,
        failedCount: findings.length - fixedCount,
      },
    });

    await addStep('message', `Bulk fix completed: ${fixedCount}/${findings.length} fixed`);
    log.info({ fixedCount, total: findings.length }, 'Bulk fix completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await addStep('error', message);

    await prisma.bulkFixSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED', completedAt: new Date() },
    });

    // Mark all still-in-progress findings as failed
    await prisma.finding.updateMany({
      where: {
        id: { in: findings.map((f) => f.id) },
        fixStatus: 'IN_PROGRESS',
      },
      data: { fixStatus: 'FAILED', fixSummary: `Bulk fix failed: ${message}` },
    });

    log.error({ err }, 'Bulk fix failed');
  }
}

async function applyBulkAiFix(
  sessionId: string,
  findings: Array<{
    ruleId: string;
    ruleName: string;
    description: string;
    affectedObject: string;
    objectType: string;
  }>,
  fixHint: string | null,
  addStep: (eventType: StepEventType, content: string) => Promise<void>,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  const mcpCommand = process.env.PBI_MCP_COMMAND || 'C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe';
  const mcpArgs = (process.env.PBI_MCP_ARGS || '--start').split(',');

  const first = findings[0];
  const objectList = findings
    .map((f, i) => `${i + 1}. ${f.affectedObject} (${f.objectType})`)
    .join('\n');

  const fixHintBlock = fixHint
    ? `\n\nFix Hint (Tabular Editor expression): ${fixHint}\nThis hint describes the intended fix in Tabular Editor syntax. Translate it to the appropriate MCP tool call for EACH object. For example:\n- "IsHidden = true" means set the isHidden property to true via an Update operation\n- "FormatString = \\"#,0\\"" means set the formatString property\n- "DataType = DataType.Decimal" means set the dataType to Decimal\n- "Delete()" means delete the object\n- "SummarizeBy = AggregateFunction.None" means set summarizeBy to None`
    : '';

  const client = new CopilotClient();
  const session = await client.createSession({
    model: 'gpt-4.1',
    sessionId: `bulkfix-${sessionId}`,
    streaming: true,
    mcpServers: {
      'powerbi-model': {
        type: 'stdio' as const,
        command: mcpCommand,
        args: mcpArgs,
        tools: ['*'],
      },
    },
    systemMessage: {
      content: `You are a Power BI modeling expert. Fix ALL of the following best practice violations in the connected semantic model.

Rule: ${first.ruleName}
Rule ID: ${first.ruleId}
Description: ${first.description}

Affected Objects (${findings.length} total):
${objectList}${fixHintBlock}

Use the available MCP tools to apply the fix to EVERY object listed above. Apply the same fix pattern to each. Be precise and only modify what is necessary. Process all objects systematically.`,
    },
  });

  await prisma.bulkFixSession.update({
    where: { id: sessionId },
    data: { agentSessionId: `bulkfix-${sessionId}` },
  });

  // Buffer for accumulating message deltas into complete messages
  let messageBuf = '';
  const flushMessageBuf = async () => {
    if (messageBuf.length > 0) {
      await addStep('message', messageBuf);
      messageBuf = '';
    }
  };

  session.on((event: SessionEvent) => {
    if (event.type === 'assistant.message_delta') {
      messageBuf += event.data.deltaContent || '';
    } else if (event.type === 'assistant.reasoning') {
      flushMessageBuf().then(() => addStep('reasoning', event.data.content || '')).catch(() => {});
    } else if (event.type === 'tool.execution_start') {
      flushMessageBuf().then(() => addStep('tool_call', JSON.stringify(event.data))).catch(() => {});
    } else if (event.type === 'tool.execution_complete') {
      flushMessageBuf().then(() => addStep('tool_result', JSON.stringify(event.data))).catch(() => {});
    } else if (event.type === 'session.error') {
      flushMessageBuf().then(() => addStep('error', JSON.stringify(event.data))).catch(() => {});
    }
  });

  log.info({ objectCount: findings.length }, 'Starting bulk AI fix session');

  const fixPromptHint = fixHint
    ? `\n\nThe recommended fix for each object is: ${fixHint}. Translate this to the appropriate MCP tool operation and apply it to every object listed.`
    : '';

  await session.sendAndWait({
    prompt: `Fix all ${findings.length} violations of "${first.ruleName}". Apply the fix to each of these objects:

${objectList}${fixPromptHint}

Process each object one by one. For each: inspect its current state, apply the fix, then move to the next. After all objects are fixed, confirm the total count of fixes applied.`,
  }, 600_000);

  // Flush any remaining buffered message content
  await flushMessageBuf();

  await client.stop();
  log.info('Bulk AI fix session completed');
}

export async function getBulkFixSession(sessionId: string) {
  const session = await prisma.bulkFixSession.findUnique({
    where: { id: sessionId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
    },
  });
  if (!session) throw Object.assign(new Error('Bulk fix session not found'), { statusCode: 404 });
  return session;
}

export async function getBulkFixSessionByRule(ruleId: string, analysisRunId: string) {
  const session = await prisma.bulkFixSession.findFirst({
    where: { ruleId, analysisRunId },
    orderBy: { startedAt: 'desc' },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
    },
  });
  if (!session) throw Object.assign(new Error('Bulk fix session not found'), { statusCode: 404 });
  return session;
}
