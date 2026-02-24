import { CopilotClient, SessionEvent } from '@github/copilot-sdk';
import { EventEmitter } from 'events';
import prisma from '../models/prisma.js';
import { getMcpClient } from '../mcp/client.js';
import { createWrappedTools, createApprovalEmitter, resolveApproval } from './chat-fix-tools.js';
import type { ApprovalEmitter, ApprovalRequest } from './chat-fix-tools.js';
import { childLogger } from '../middleware/logger.js';

const log = childLogger({ module: 'chat-fix' });

// ── Types ──

export interface ChatFixSessionInfo {
  sessionId: string;
  ruleId: string;
  analysisRunId: string;
  status: string;
  resumed: boolean;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolName: string | null;
    proposalId: string | null;
    approvalStatus: string | null;
    ordering: number;
    timestamp: string;
  }>;
}

interface SSEEmitter extends EventEmitter {
  on(event: 'sse', listener: (data: SSEEvent) => void): this;
  emit(event: 'sse', data: SSEEvent): boolean;
}

export type SSEEvent =
  | { type: 'message_delta'; content: string }
  | { type: 'message_complete'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_executing'; toolName: string; args: Record<string, unknown>; isWrite: boolean }
  | { type: 'tool_result'; toolName: string; result: unknown; isWrite: boolean; proposalId?: string }
  | { type: 'approval_required'; proposalId: string; toolName: string; operation: string; args: Record<string, unknown>; description: string }
  | { type: 'approval_resolved'; proposalId: string; approved: boolean; reason?: string }
  | { type: 'session_idle' }
  | { type: 'session_resumed'; sessionId: string }
  | { type: 'session_restarted'; sessionId: string }
  | { type: 'error'; message: string };

// ── In-Memory Session Registry ──

interface ActiveSession {
  copilotClient: CopilotClient;
  copilotSession: Awaited<ReturnType<CopilotClient['createSession']>>;
  approvalEmitter: ApprovalEmitter;
  sseEmitter: SSEEmitter;
  ruleId: string;
  analysisRunId: string;
  messageCounter: number;
  isProcessing: boolean;
  pendingInitialPrompt: string | null;
}

const activeSessions = new Map<string, ActiveSession>();

// ── Session Lifecycle ──

export async function getOrResumeSession(
  ruleId: string,
  analysisRunId: string,
): Promise<ChatFixSessionInfo> {
  // Check for existing ACTIVE session in DB
  const existing = await prisma.chatFixSession.findFirst({
    where: { ruleId, analysisRunId, status: 'ACTIVE' },
    include: { messages: { orderBy: { ordering: 'asc' } } },
  });

  if (existing) {
    // Check if it's still in memory
    const inMemory = activeSessions.get(existing.id);
    if (inMemory) {
      return {
        sessionId: existing.id,
        ruleId: existing.ruleId,
        analysisRunId: existing.analysisRunId,
        status: existing.status,
        resumed: true,
        messages: existing.messages.map((m) => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
      };
    }

    // Resume: recreate CopilotClient session
    try {
      await initCopilotSession(existing.id, ruleId, analysisRunId, existing.copilotSessionId);
      return {
        sessionId: existing.id,
        ruleId,
        analysisRunId,
        status: 'ACTIVE',
        resumed: true,
        messages: existing.messages.map((m) => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
      };
    } catch (err) {
      log.warn({ err, sessionId: existing.id }, 'Failed to resume Copilot session, creating new');
      // Mark old session as closed and fall through to create new
      await prisma.chatFixSession.update({
        where: { id: existing.id },
        data: { status: 'CLOSED' },
      });
    }
  }

  // Create new session
  return createChatFixSession(ruleId, analysisRunId);
}

async function createChatFixSession(
  ruleId: string,
  analysisRunId: string,
): Promise<ChatFixSessionInfo> {
  // Create DB record
  const dbSession = await prisma.chatFixSession.create({
    data: { ruleId, analysisRunId, status: 'ACTIVE' },
  });

  const active = await initCopilotSession(dbSession.id, ruleId, analysisRunId, null);

  // Update DB with copilot session ID
  await prisma.chatFixSession.update({
    where: { id: dbSession.id },
    data: { copilotSessionId: `chatfix-${dbSession.id}` },
  });

  // Build system context and send initial prompt
  const systemPrompt = await buildInitialPrompt(ruleId, analysisRunId);

  // Persist system message
  await persistMessage(dbSession.id, active, 'system', systemPrompt);

  // Defer initial prompt until the SSE consumer connects (avoids race where
  // events fire before the frontend attaches its EventSource listener).
  active.pendingInitialPrompt = systemPrompt;

  return {
    sessionId: dbSession.id,
    ruleId,
    analysisRunId,
    status: 'ACTIVE',
    resumed: false,
    messages: [],
  };
}

async function initCopilotSession(
  dbSessionId: string,
  ruleId: string,
  analysisRunId: string,
  existingCopilotSessionId: string | null,
): Promise<ActiveSession> {
  const mcpClient = getMcpClient();
  if (!mcpClient) {
    throw Object.assign(new Error('No MCP connection. Connect to a model first.'), { statusCode: 422 });
  }

  const approvalEmitter = createApprovalEmitter();
  const sseEmitter = new EventEmitter() as SSEEmitter;

  // Create wrapped tools from discovered MCP tools
  const wrappedTools = await createWrappedTools(mcpClient, approvalEmitter);

  // Build system message
  const systemMessage = await buildSystemMessage(ruleId, analysisRunId);

  const copilotClient = new CopilotClient();
  let copilotSession;

  if (existingCopilotSessionId) {
    try {
      copilotSession = await copilotClient.resumeSession(existingCopilotSessionId);
      log.info({ sessionId: dbSessionId, copilotSessionId: existingCopilotSessionId }, 'Resumed Copilot session');
    } catch {
      // Resume failed, create new
      copilotSession = await copilotClient.createSession({
        model: 'gpt-4.1',
        sessionId: `chatfix-${dbSessionId}`,
        streaming: true,
        tools: wrappedTools,
        systemMessage: { content: systemMessage },
      });
      log.info({ sessionId: dbSessionId }, 'Created new Copilot session (resume failed)');
    }
  } else {
    copilotSession = await copilotClient.createSession({
      model: 'gpt-4.1',
      sessionId: `chatfix-${dbSessionId}`,
      streaming: true,
      tools: wrappedTools,
      systemMessage: { content: systemMessage },
    });
    log.info({ sessionId: dbSessionId }, 'Created new Copilot session');
  }

  const active: ActiveSession = {
    copilotClient,
    copilotSession,
    approvalEmitter,
    sseEmitter,
    ruleId,
    analysisRunId,
    messageCounter: 0,
    isProcessing: false,
    pendingInitialPrompt: null,
  };

  // Wire approval emitter → SSE
  approvalEmitter.on('approval_required', (req: ApprovalRequest) => {
    sseEmitter.emit('sse', {
      type: 'approval_required',
      proposalId: req.proposalId,
      toolName: req.toolName,
      operation: req.operation,
      args: req.args,
      description: req.description,
    });
  });

  approvalEmitter.on('tool_executing', (data) => {
    sseEmitter.emit('sse', {
      type: 'tool_executing',
      toolName: data.toolName,
      args: data.args,
      isWrite: data.isWrite,
    });
  });

  approvalEmitter.on('tool_result', (data) => {
    // Persist tool results
    persistMessage(dbSessionId, active, 'tool_result', JSON.stringify(data.result), data.toolName, data.proposalId).catch(() => {});
    sseEmitter.emit('sse', {
      type: 'tool_result',
      toolName: data.toolName,
      result: data.result,
      isWrite: data.isWrite,
      proposalId: data.proposalId,
    });
  });

  // Wire Copilot session events → SSE
  let messageBuf = '';

  copilotSession.on((event: SessionEvent) => {
    if (event.type === 'assistant.message_delta') {
      const delta = event.data.deltaContent || '';
      messageBuf += delta;
      sseEmitter.emit('sse', { type: 'message_delta', content: delta });
    } else if (event.type === 'assistant.reasoning') {
      // Flush message buffer first
      if (messageBuf) {
        persistMessage(dbSessionId, active, 'assistant', messageBuf).catch(() => {});
        sseEmitter.emit('sse', { type: 'message_complete', content: messageBuf });
        messageBuf = '';
      }
      const content = event.data.content || '';
      persistMessage(dbSessionId, active, 'reasoning', content).catch(() => {});
      sseEmitter.emit('sse', { type: 'reasoning', content });
    } else if (event.type === 'tool.execution_start') {
      // Flush message buffer
      if (messageBuf) {
        persistMessage(dbSessionId, active, 'assistant', messageBuf).catch(() => {});
        sseEmitter.emit('sse', { type: 'message_complete', content: messageBuf });
        messageBuf = '';
      }
      persistMessage(dbSessionId, active, 'tool_call', JSON.stringify(event.data)).catch(() => {});
    } else if (event.type === 'session.idle') {
      // Flush message buffer
      if (messageBuf) {
        persistMessage(dbSessionId, active, 'assistant', messageBuf).catch(() => {});
        sseEmitter.emit('sse', { type: 'message_complete', content: messageBuf });
        messageBuf = '';
      }
      active.isProcessing = false;
      sseEmitter.emit('sse', { type: 'session_idle' });
    } else if (event.type === 'session.error') {
      if (messageBuf) {
        persistMessage(dbSessionId, active, 'assistant', messageBuf).catch(() => {});
        messageBuf = '';
      }
      const errorMsg = JSON.stringify(event.data);
      persistMessage(dbSessionId, active, 'error', errorMsg).catch(() => {});
      sseEmitter.emit('sse', { type: 'error', message: errorMsg });
    }
  });

  activeSessions.set(dbSessionId, active);
  return active;
}

// ── Message Handling ──

export async function sendMessage(sessionId: string, content: string): Promise<void> {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw Object.assign(new Error('Message content must be a non-empty string'), { statusCode: 400 });
  }
  if (content.length > 10_000) {
    throw Object.assign(new Error('Message content too long (max 10000 characters)'), { statusCode: 400 });
  }

  const active = activeSessions.get(sessionId);
  if (!active) {
    throw Object.assign(new Error('Session not found or not active'), { statusCode: 404 });
  }
  if (active.isProcessing) {
    throw Object.assign(new Error('Session is currently processing'), { statusCode: 409 });
  }

  const trimmed = content.trim();

  // Persist user message
  await persistMessage(sessionId, active, 'user', trimmed);

  // Send to AI
  await sendToAI(sessionId, trimmed);
}

async function sendToAI(sessionId: string, content: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (!active) return;

  active.isProcessing = true;
  try {
    await active.copilotSession.sendAndWait({ prompt: content }, 600_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI session error';
    log.error({ err, sessionId }, 'sendAndWait failed');
    active.sseEmitter.emit('sse', { type: 'error', message });
  } finally {
    active.isProcessing = false;
  }
}

// ── Approval Handling ──

export function approveToolCall(sessionId: string, proposalId: string): boolean {
  const active = activeSessions.get(sessionId);
  if (!active) return false;

  const resolved = resolveApproval(proposalId, true);
  if (resolved) {
    // Persist approval
    persistMessage(sessionId, active, 'approval', 'approved', undefined, proposalId, 'approved').catch(() => {});
    active.sseEmitter.emit('sse', { type: 'approval_resolved', proposalId, approved: true });
  }
  return resolved;
}

export function rejectToolCall(sessionId: string, proposalId: string, reason?: string): boolean {
  const active = activeSessions.get(sessionId);
  if (!active) return false;

  const resolved = resolveApproval(proposalId, false);
  if (resolved) {
    // Persist rejection
    persistMessage(sessionId, active, 'approval', reason || 'rejected', undefined, proposalId, 'rejected').catch(() => {});
    active.sseEmitter.emit('sse', { type: 'approval_resolved', proposalId, approved: false, reason });
  }
  return resolved;
}

// ── Session Management ──

export async function clearAndRestartSession(sessionId: string): Promise<ChatFixSessionInfo> {
  const active = activeSessions.get(sessionId);
  const dbSession = await prisma.chatFixSession.findUnique({ where: { id: sessionId } });
  if (!dbSession) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  }

  // Cleanup Copilot session
  if (active) {
    try {
      await active.copilotClient.stop();
    } catch (err) {
      log.warn({ err, sessionId }, 'Error stopping copilot client during restart');
    }
    activeSessions.delete(sessionId);
  }

  // Mark old session as CLEARED
  await prisma.chatFixSession.update({
    where: { id: sessionId },
    data: { status: 'CLEARED' },
  });

  // Reset IN_PROGRESS findings back to UNFIXED
  await prisma.finding.updateMany({
    where: {
      ruleId: dbSession.ruleId,
      analysisRunId: dbSession.analysisRunId,
      fixStatus: 'IN_PROGRESS',
    },
    data: { fixStatus: 'UNFIXED' },
  });

  // Create fresh session
  return createChatFixSession(dbSession.ruleId, dbSession.analysisRunId);
}

export async function closeSession(sessionId: string): Promise<void> {
  const active = activeSessions.get(sessionId);
  if (active) {
    try {
      await active.copilotClient.stop();
    } catch (err) {
      log.warn({ err, sessionId }, 'Error stopping copilot client');
    }
    activeSessions.delete(sessionId);
  }

  await prisma.chatFixSession.update({
    where: { id: sessionId },
    data: { status: 'CLOSED' },
  }).catch(() => {});
}

export async function getActiveSessions(analysisRunId: string) {
  return prisma.chatFixSession.findMany({
    where: { analysisRunId, status: 'ACTIVE' },
    select: { id: true, ruleId: true, analysisRunId: true, status: true, createdAt: true },
  });
}

export function getSSEEmitter(sessionId: string): SSEEmitter | null {
  const active = activeSessions.get(sessionId);
  if (!active) return null;

  // Flush deferred initial prompt now that an SSE consumer is connecting
  if (active.pendingInitialPrompt) {
    const prompt = active.pendingInitialPrompt;
    active.pendingInitialPrompt = null;
    sendToAI(sessionId, prompt).catch((err) => {
      log.error({ err, sessionId }, 'Failed to send initial prompt');
    });
  }

  return active.sseEmitter;
}

// ── Helpers ──

async function persistMessage(
  sessionId: string,
  active: ActiveSession,
  role: string,
  content: string,
  toolName?: string,
  proposalId?: string,
  approvalStatus?: string,
): Promise<void> {
  active.messageCounter++;
  await prisma.chatFixMessage.create({
    data: {
      chatFixSessionId: sessionId,
      role,
      content,
      toolName: toolName ?? null,
      proposalId: proposalId ?? null,
      approvalStatus: approvalStatus ?? null,
      ordering: active.messageCounter,
    },
  });
}

async function buildSystemMessage(ruleId: string, analysisRunId: string): Promise<string> {
  const findings = await prisma.finding.findMany({
    where: { ruleId, analysisRunId, fixStatus: { in: ['UNFIXED', 'IN_PROGRESS'] } },
  });

  if (findings.length === 0) {
    return 'You are a Power BI modeling expert. There are no unfixed findings for this rule.';
  }

  const first = findings[0];

  const objectList = findings
    .map((f, i) => `<object>${i + 1}. ${f.affectedObject} (${f.objectType})</object>`)
    .join('\n');

  return `You are a Power BI modeling expert helping a user fix best practice violations in their semantic model.
This rule has no automated fix expression, so you must determine the correct fix by analyzing the rule description and inspecting the affected objects using MCP tools.

Rule: ${first.ruleName}
Rule ID: ${ruleId}
Description: ${first.description}

Affected Objects (${findings.length} total):

<object_list>
${objectList}
</object_list>

BEHAVIOR:
- Start by briefly explaining the rule violation and its impact
- Propose a fix strategy and ask the user if they'd like to proceed
- Use read tools freely to inspect the current state of objects
- When ready to make changes, call the appropriate write tool — the user will be prompted to approve each change
- After each approved change, confirm the result
- Be helpful and responsive to user questions — they may want to adjust the approach
- Track progress: tell the user how many objects have been fixed vs remaining
- Be concise and actionable`;
}

async function buildInitialPrompt(ruleId: string, analysisRunId: string): Promise<string> {
  const findings = await prisma.finding.findMany({
    where: { ruleId, analysisRunId, fixStatus: { in: ['UNFIXED', 'IN_PROGRESS'] } },
  });

  if (findings.length === 0) {
    return 'All findings for this rule have already been fixed.';
  }

  const first = findings[0];
  return `I have ${findings.length} violation(s) of rule "${first.ruleName}" that need to be fixed. Please analyze the violations and propose a fix strategy.`;
}
