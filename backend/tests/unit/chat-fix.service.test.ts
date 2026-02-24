import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks ──

const mockPrisma = {
  chatFixSession: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  chatFixMessage: {
    create: vi.fn(),
  },
  finding: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
};
vi.mock('../../src/models/prisma.js', () => ({ default: mockPrisma }));

const mockMcpClient = {
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
  callTool: vi.fn(),
};
const mockGetMcpClient = vi.fn(() => mockMcpClient);
vi.mock('../../src/mcp/client.js', () => ({
  getMcpClient: (...args: unknown[]) => mockGetMcpClient(...args),
}));

vi.mock('../../src/services/rules.service.js', () => ({
  getRawRules: vi.fn().mockResolvedValue([]),
}));

const mockSendAndWait = vi.fn().mockResolvedValue({ data: { content: 'Fixed' } });
const mockCopilotOn = vi.fn();
const mockCopilotStop = vi.fn();
const mockResumeSession = vi.fn();

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue({
      on: mockCopilotOn,
      sendAndWait: mockSendAndWait,
    }),
    resumeSession: mockResumeSession,
    stop: mockCopilotStop,
  })),
  SessionEvent: {},
  defineTool: vi.fn((name: string, config: { description: string; parameters: unknown; handler: Function }) => ({
    name,
    description: config.description,
    parameters: config.parameters,
    handler: config.handler,
  })),
}));

vi.mock('../../src/middleware/logger.js', () => ({
  childLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Now import the service under test
const {
  getOrResumeSession,
  sendMessage,
  approveToolCall,
  rejectToolCall,
  clearAndRestartSession,
  closeSession,
  getActiveSessions,
  getSSEEmitter,
} = await import('../../src/services/chat-fix.service.js');

describe('chat-fix.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpClient.listTools.mockResolvedValue({ tools: [] });
    mockResumeSession.mockResolvedValue({
      on: mockCopilotOn,
      sendAndWait: mockSendAndWait,
    });
  });

  describe('getOrResumeSession', () => {
    it('creates a new session when none exists', async () => {
      mockPrisma.chatFixSession.findFirst.mockResolvedValue(null);
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 's1', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([{
        id: 'f1',
        ruleId: 'HIDDEN_COLUMN',
        ruleName: 'Hide FK columns',
        description: 'FK columns should be hidden',
        affectedObject: "'Sales'[RegionId]",
        objectType: 'DataColumn',
        fixStatus: 'UNFIXED',
      }]);

      const result = await getOrResumeSession('HIDDEN_COLUMN', 'run1');

      expect(result.sessionId).toBe('s1');
      expect(result.resumed).toBe(false);
      expect(result.status).toBe('ACTIVE');
      expect(mockPrisma.chatFixSession.create).toHaveBeenCalledWith({
        data: { ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' },
      });
    });

    it('resumes an existing DB session with copilot resumeSession', async () => {
      mockPrisma.chatFixSession.findFirst.mockResolvedValue({
        id: 's-exist',
        ruleId: 'HIDDEN_COLUMN',
        analysisRunId: 'run1',
        status: 'ACTIVE',
        copilotSessionId: 'cop-123',
        messages: [{ id: 'm1', role: 'system', content: 'hello', toolName: null, proposalId: null, approvalStatus: null, ordering: 1, timestamp: new Date() }],
      });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const result = await getOrResumeSession('HIDDEN_COLUMN', 'run1');

      expect(result.resumed).toBe(true);
      expect(result.sessionId).toBe('s-exist');
      expect(result.messages).toHaveLength(1);
    });

    it('creates new session if initCopilotSession fails (no MCP)', async () => {
      // First call to getMcpClient returns null (resume attempt fails), second returns the real client (new session)
      mockGetMcpClient.mockReturnValueOnce(null).mockReturnValueOnce(mockMcpClient);

      mockPrisma.chatFixSession.findFirst.mockResolvedValue({
        id: 's-resume-fail',
        ruleId: 'HIDDEN_COLUMN',
        analysisRunId: 'run1',
        status: 'ACTIVE',
        copilotSessionId: 'cop-failed',
        messages: [],
      });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 's-new-after-fail', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const result = await getOrResumeSession('HIDDEN_COLUMN', 'run1');

      expect(result.sessionId).toBe('s-new-after-fail');
      expect(result.resumed).toBe(false);
      // Old session should have been marked CLOSED
      expect(mockPrisma.chatFixSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's-resume-fail' },
          data: { status: 'CLOSED' },
        }),
      );
    });
  });

  describe('sendMessage', () => {
    async function setupActiveSession() {
      mockPrisma.chatFixSession.findFirst.mockResolvedValue(null);
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 'msg-s1', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const session = await getOrResumeSession('HIDDEN_COLUMN', 'run1');
      return session.sessionId;
    }

    it('throws 400 for empty string content', async () => {
      await expect(sendMessage('any-id', '')).rejects.toThrow('Message content must be a non-empty string');
    });

    it('throws 400 for whitespace-only content', async () => {
      await expect(sendMessage('any-id', '   ')).rejects.toThrow('Message content must be a non-empty string');
    });

    it('throws 400 for content exceeding max length', async () => {
      const longContent = 'x'.repeat(10_001);
      await expect(sendMessage('any-id', longContent)).rejects.toThrow('Message content too long');
    });

    it('throws 404 if session not found', async () => {
      await expect(sendMessage('nonexistent', 'hello')).rejects.toThrow('Session not found');
    });

    it('sends a valid message successfully', async () => {
      const sid = await setupActiveSession();

      // sendMessage is async and calls sendAndWait internally
      await sendMessage(sid, 'Please fix the columns');

      expect(mockPrisma.chatFixMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            chatFixSessionId: sid,
            role: 'user',
            content: 'Please fix the columns',
          }),
        }),
      );
    });

    it('trims whitespace from content', async () => {
      const sid = await setupActiveSession();

      await sendMessage(sid, '  hello world  ');

      expect(mockPrisma.chatFixMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'user',
            content: 'hello world',
          }),
        }),
      );
    });
  });

  describe('approveToolCall', () => {
    it('returns false when session not in memory', () => {
      const result = approveToolCall('nonexistent-session', 'p1');
      expect(result).toBe(false);
    });
  });

  describe('rejectToolCall', () => {
    it('returns false when session not in memory', () => {
      const result = rejectToolCall('nonexistent-session', 'p1');
      expect(result).toBe(false);
    });
  });

  describe('clearAndRestartSession', () => {
    it('throws 404 if session not found in DB', async () => {
      mockPrisma.chatFixSession.findUnique.mockResolvedValue(null);
      await expect(clearAndRestartSession('nonexistent')).rejects.toThrow('Session not found');
    });

    it('marks session as CLEARED, resets findings, and creates new', async () => {
      mockPrisma.chatFixSession.findUnique.mockResolvedValue({
        id: 'old-s',
        ruleId: 'HIDDEN_COLUMN',
        analysisRunId: 'run1',
        status: 'ACTIVE',
      });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 'new-s', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const result = await clearAndRestartSession('old-s');

      expect(result.sessionId).toBe('new-s');
      expect(result.resumed).toBe(false);

      // Old session marked CLEARED
      expect(mockPrisma.chatFixSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-s' },
          data: { status: 'CLEARED' },
        }),
      );

      // IN_PROGRESS findings reset to UNFIXED
      expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ruleId: 'HIDDEN_COLUMN',
            analysisRunId: 'run1',
            fixStatus: 'IN_PROGRESS',
          },
          data: { fixStatus: 'UNFIXED' },
        }),
      );
    });
  });

  describe('closeSession', () => {
    it('updates DB status to CLOSED even when session not in memory', async () => {
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      await closeSession('unknown-sid');
      expect(mockPrisma.chatFixSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unknown-sid' },
          data: { status: 'CLOSED' },
        }),
      );
    });

    it('stops copilot client and removes from memory for active session', async () => {
      // First create an active session
      mockPrisma.chatFixSession.findFirst.mockResolvedValue(null);
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 'close-s', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const { sessionId } = await getOrResumeSession('HIDDEN_COLUMN', 'run1');
      expect(getSSEEmitter(sessionId)).not.toBeNull();

      await closeSession(sessionId);
      expect(mockCopilotStop).toHaveBeenCalled();
      expect(getSSEEmitter(sessionId)).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('queries DB for active sessions', async () => {
      mockPrisma.chatFixSession.findMany.mockResolvedValue([
        { id: 's1', ruleId: 'R1', analysisRunId: 'run1', status: 'ACTIVE', createdAt: new Date() },
      ]);

      const result = await getActiveSessions('run1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.chatFixSession.findMany).toHaveBeenCalledWith({
        where: { analysisRunId: 'run1', status: 'ACTIVE' },
        select: { id: true, ruleId: true, analysisRunId: true, status: true, createdAt: true },
      });
    });
  });

  describe('getSSEEmitter', () => {
    it('returns null for unknown session', () => {
      expect(getSSEEmitter('nonexistent')).toBeNull();
    });

    it('triggers deferred initial prompt on first call for a new session', async () => {
      mockPrisma.chatFixSession.findFirst.mockResolvedValue(null);
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 'sse-s', ruleId: 'HIDDEN_COLUMN', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const { sessionId } = await getOrResumeSession('HIDDEN_COLUMN', 'run1');

      // First call triggers deferred prompt
      const emitter = getSSEEmitter(sessionId);
      expect(emitter).not.toBeNull();
      expect(mockSendAndWait).toHaveBeenCalled();

      mockSendAndWait.mockClear();

      // Second call does NOT re-trigger prompt, but emits session_idle for resumed/idle session
      const emitter2 = getSSEEmitter(sessionId);
      expect(emitter2).not.toBeNull();
      expect(mockSendAndWait).not.toHaveBeenCalled();
    });

    it('emits session_idle via nextTick for idle resumed sessions', async () => {
      mockPrisma.chatFixSession.findFirst.mockResolvedValue(null);
      mockPrisma.chatFixSession.create.mockResolvedValue({ id: 'sse-idle', ruleId: 'R1', analysisRunId: 'run1', status: 'ACTIVE' });
      mockPrisma.chatFixSession.update.mockResolvedValue({});
      mockPrisma.chatFixMessage.create.mockResolvedValue({});
      mockPrisma.finding.findMany.mockResolvedValue([]);

      const { sessionId } = await getOrResumeSession('R1', 'run1');

      // First call consumes the deferred prompt (fires sendToAI as fire-and-forget)
      getSSEEmitter(sessionId);
      // Let the fire-and-forget sendToAI complete so isProcessing resets to false
      await new Promise((r) => setTimeout(r, 0));
      mockSendAndWait.mockClear();

      // Second call should emit session_idle asynchronously (nextTick)
      const emitter = getSSEEmitter(sessionId)!;
      const events: unknown[] = [];
      emitter.on('sse', (data: unknown) => events.push(data));

      // Wait for process.nextTick
      await new Promise((r) => process.nextTick(r));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'session_idle' });
    });
  });
});
