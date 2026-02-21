import { CopilotClient, SessionEvent } from '@github/copilot-sdk';
import prisma from '../models/prisma.js';
import { getRawRules } from './rules.service.js';
import { logger, childLogger } from '../middleware/logger.js';

type StepEventType = 'reasoning' | 'tool_call' | 'tool_result' | 'message' | 'error';

interface FixStepCallback {
  (step: { eventType: StepEventType; content: string; stepNumber: number }): void;
}

export async function triggerFix(
  findingId: string,
  onStep?: FixStepCallback,
): Promise<string> {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: { fixSession: true },
  });
  if (!finding) throw Object.assign(new Error('Finding not found'), { statusCode: 404 });
  if (finding.fixStatus === 'FIXED')
    throw Object.assign(new Error('Finding already fixed'), { statusCode: 409 });
  if (finding.fixStatus === 'IN_PROGRESS')
    throw Object.assign(new Error('Fix already in progress'), { statusCode: 409 });

  // Create fix session
  const session = await prisma.fixSession.create({
    data: {
      findingId,
      status: 'RUNNING',
    },
  });

  // Mark finding as in progress
  await prisma.finding.update({
    where: { id: findingId },
    data: { fixStatus: 'IN_PROGRESS' },
  });

  const log = childLogger({ fixSessionId: session.id, findingId });

  // Run fix asynchronously
  processFix(session.id, finding, onStep, log).catch((err) => {
    log.error({ err }, 'Fix processing failed');
  });

  return session.id;
}

async function processFix(
  sessionId: string,
  finding: {
    id: string;
    ruleId: string;
    ruleName: string;
    description: string;
    affectedObject: string;
    objectType: string;
    hasAutoFix: boolean;
  },
  onStep: FixStepCallback | undefined,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  let stepNumber = 0;

  const addStep = async (eventType: StepEventType, content: string) => {
    stepNumber++;
    await prisma.fixSessionStep.create({
      data: {
        fixSessionId: sessionId,
        stepNumber,
        eventType,
        content,
      },
    });
    onStep?.({ eventType, content, stepNumber });
  };

  try {
    // Check if this rule has a deterministic fix
    const rules = await getRawRules();
    const rule = rules.find((r) => r.ID === finding.ruleId);

    const fixHint = rule?.FixExpression || null;
    await addStep('reasoning', `Using AI agent to fix rule ${finding.ruleId}${fixHint ? ` (hint: ${fixHint})` : ''}`);
    await applyAiFix(sessionId, finding, fixHint, addStep, log);

    // Mark as fixed
    await prisma.fixSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await prisma.finding.update({
      where: { id: finding.id },
      data: { fixStatus: 'FIXED', fixSummary: 'Fixed via AI agent' },
    });

    await addStep('message', 'Fix applied successfully');
    log.info('Fix completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await addStep('error', message);

    await prisma.fixSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED', completedAt: new Date() },
    });
    await prisma.finding.update({
      where: { id: finding.id },
      data: { fixStatus: 'FAILED', fixSummary: `Fix failed: ${message}` },
    });

    log.error({ err }, 'Fix failed');
  }
}

async function applyAiFix(
  sessionId: string,
  finding: {
    ruleId: string;
    ruleName: string;
    description: string;
    affectedObject: string;
    objectType: string;
  },
  fixHint: string | null,
  addStep: (eventType: StepEventType, content: string) => Promise<void>,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  const mcpCommand = process.env.PBI_MCP_COMMAND || 'C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe';
  const mcpArgs = (process.env.PBI_MCP_ARGS || '--start').split(',');

  const fixHintBlock = fixHint
    ? `\n\nFix Hint (Tabular Editor expression): ${fixHint}\nThis hint describes the intended fix in Tabular Editor syntax. Translate it to the appropriate MCP tool call. For example:\n- "IsHidden = true" means set the isHidden property to true via an Update operation\n- "FormatString = \"#,0\"" means set the formatString property\n- "DataType = DataType.Decimal" means set the dataType to Decimal\n- "Delete()" means delete the object\n- "SummarizeBy = AggregateFunction.None" means set summarizeBy to None`
    : '';

  const client = new CopilotClient();
  const session = await client.createSession({
    model: 'gpt-4.1',
    sessionId: `fix-${sessionId}`,
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
      content: `You are a Power BI modeling expert. Fix the following best practice violation in the connected semantic model.

Rule: ${finding.ruleName}
Rule ID: ${finding.ruleId}
Description: ${finding.description}
Affected Object: ${finding.affectedObject}
Object Type: ${finding.objectType}${fixHintBlock}

Use the available MCP tools to inspect the model and apply the fix. Be precise and only modify what is necessary.`,
    },
  });

  // Update session with agent session ID
  await prisma.fixSession.update({
    where: { id: sessionId },
    data: { agentSessionId: `fix-${sessionId}` },
  });

  // Listen for events and record steps
  session.on((event: SessionEvent) => {
    if (event.type === 'assistant.message_delta') {
      addStep('message', event.data.deltaContent).catch(() => {});
    } else if (event.type === 'assistant.reasoning') {
      addStep('reasoning', event.data.content || '').catch(() => {});
    } else if (event.type === 'tool.execution_start') {
      addStep('tool_call', JSON.stringify(event.data)).catch(() => {});
    } else if (event.type === 'tool.execution_complete') {
      addStep('tool_result', JSON.stringify(event.data)).catch(() => {});
    } else if (event.type === 'session.error') {
      addStep('error', JSON.stringify(event.data)).catch(() => {});
    }
  });

  log.info('Starting AI fix session');

  const fixPromptHint = fixHint
    ? `\n\nThe recommended fix is: ${fixHint}. Translate this to the appropriate MCP tool operation.`
    : '';

  await session.sendAndWait({
    prompt: `Fix the best practice violation: "${finding.ruleName}" on object "${finding.affectedObject}" (${finding.objectType}).${fixPromptHint}

First inspect the current state of the object, then apply the minimal fix needed to resolve the violation. After applying the fix, verify it was applied correctly.`,
  });

  await client.stop();
  log.info('AI fix session completed');
}

export async function getFixSession(findingId: string) {
  const session = await prisma.fixSession.findUnique({
    where: { findingId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
    },
  });
  if (!session) throw Object.assign(new Error('Fix session not found'), { statusCode: 404 });
  return session;
}
