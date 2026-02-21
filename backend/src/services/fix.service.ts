import { CopilotClient, SessionEvent } from '@github/copilot-sdk';
import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
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

    if (rule?.FixExpression && finding.hasAutoFix) {
      await addStep('reasoning', `Applying deterministic fix for rule ${finding.ruleId}`);
      await applyDeterministicFix(finding, rule.FixExpression, addStep, log);
    } else {
      await addStep('reasoning', `No deterministic fix available — using AI agent for ${finding.ruleId}`);
      await applyAiFix(sessionId, finding, addStep, log);
    }

    // Mark as fixed
    await prisma.fixSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await prisma.finding.update({
      where: { id: finding.id },
      data: { fixStatus: 'FIXED', fixSummary: `Fixed via ${rule?.FixExpression ? 'deterministic' : 'AI'} fix` },
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

async function applyDeterministicFix(
  finding: { affectedObject: string; objectType: string },
  fixExpression: string,
  addStep: (eventType: StepEventType, content: string) => Promise<void>,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  const client = getMcpClient();
  if (!client) throw new Error('Not connected to a model');

  // Parse common fix expressions
  const propAssignment = fixExpression.match(/^(\w+)\s*=\s*(.+)$/);
  if (propAssignment) {
    const [, property, valueStr] = propAssignment;
    const value = parseFixValue(valueStr);

    await addStep('tool_call', JSON.stringify({
      tool: getToolForObjectType(finding.objectType),
      operation: 'Update',
      property,
      value,
      object: finding.affectedObject,
    }));

    const result = await client.callTool({
      name: getToolForObjectType(finding.objectType),
      arguments: {
        request: {
          operation: 'Update',
          name: extractObjectName(finding.affectedObject),
          tableName: extractTableName(finding.affectedObject),
          properties: { [property]: value },
        },
      },
    });

    await addStep('tool_result', JSON.stringify(result));
    log.info({ property, value }, 'Deterministic fix applied');
    return;
  }

  // Delete operations
  if (fixExpression.includes('Delete()')) {
    await addStep('tool_call', JSON.stringify({
      tool: getToolForObjectType(finding.objectType),
      operation: 'Delete',
      object: finding.affectedObject,
    }));

    const result = await client.callTool({
      name: getToolForObjectType(finding.objectType),
      arguments: {
        request: {
          operation: 'Delete',
          name: extractObjectName(finding.affectedObject),
          tableName: extractTableName(finding.affectedObject),
        },
      },
    });

    await addStep('tool_result', JSON.stringify(result));
    log.info('Deterministic delete fix applied');
    return;
  }

  throw new Error(`Cannot parse deterministic fix expression: ${fixExpression}`);
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
  addStep: (eventType: StepEventType, content: string) => Promise<void>,
  log: ReturnType<typeof childLogger>,
): Promise<void> {
  const mcpCommand = process.env.PBI_MCP_COMMAND || 'C:\\Users\\momohammad\\.vscode-insiders\\extensions\\analysis-services.powerbi-modeling-mcp-0.3.1-win32-arm64\\server\\powerbi-modeling-mcp.exe';
  const mcpArgs = (process.env.PBI_MCP_ARGS || '--start').split(',');

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
Object Type: ${finding.objectType}

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

  await session.sendAndWait({
    prompt: `Fix the best practice violation: "${finding.ruleName}" on object "${finding.affectedObject}" (${finding.objectType}). 

First inspect the current state of the object, then apply the minimal fix needed to resolve the violation. After applying the fix, verify it was applied correctly.`,
  });

  await client.stop();
  log.info('AI fix session completed');
}

function getToolForObjectType(objectType: string): string {
  const mapping: Record<string, string> = {
    DataColumn: 'column_operations',
    CalculatedColumn: 'column_operations',
    Measure: 'measure_operations',
    Table: 'table_operations',
    Relationship: 'relationship_operations',
  };
  return mapping[objectType] || 'model_operations';
}

function extractObjectName(affectedObject: string): string {
  // Format: 'TableName'[ObjectName] or just ObjectName
  const match = affectedObject.match(/\[([^\]]+)\]/);
  return match ? match[1] : affectedObject;
}

function extractTableName(affectedObject: string): string | undefined {
  // Format: 'TableName'[ObjectName]
  const match = affectedObject.match(/'([^']+)'/);
  return match ? match[1] : undefined;
}

function parseFixValue(valueStr: string): unknown {
  // Handle common value patterns
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;
  if (valueStr.startsWith('"') && valueStr.endsWith('"')) return valueStr.slice(1, -1);
  if (valueStr.includes('DataType.')) return valueStr.split('.')[1];
  if (valueStr.includes('SummarizeBy.')) return valueStr.split('.')[1];
  if (/^\d+$/.test(valueStr)) return parseInt(valueStr, 10);
  return valueStr;
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
