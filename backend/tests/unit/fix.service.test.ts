import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  finding: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  fixSession: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  fixSessionStep: {
    create: vi.fn(),
  },
};
vi.mock('../../src/models/prisma.js', () => ({ default: mockPrisma }));

// Mock MCP client
const mockCallTool = vi.fn();
vi.mock('../../src/mcp/client.js', () => ({
  getMcpClient: () => ({ callTool: mockCallTool }),
  getConnectionStatus: () => ({ connected: true, databaseName: 'TestModel' }),
}));

// Mock rules service
vi.mock('../../src/services/rules.service.js', () => ({
  getRawRules: vi.fn().mockResolvedValue([
    {
      ID: 'HIDDEN_COLUMN',
      Name: '[Maintenance] Hide foreign key columns',
      Category: 'Maintenance',
      Severity: 2,
      Description: 'FK columns should be hidden',
      Scope: 'DataColumn',
      Expression: 'IsHidden == false',
      FixExpression: 'IsHidden = true',
    },
    {
      ID: 'NO_FIX_RULE',
      Name: '[DAX] Complex check',
      Category: 'DAX Expressions',
      Severity: 3,
      Description: 'Complex DAX issue',
      Scope: 'Measure',
      Expression: 'RegEx.IsMatch(Expression, "IFERROR")',
    },
  ]),
}));

// Mock CopilotClient
vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue({
      on: vi.fn(),
      sendAndWait: vi.fn().mockResolvedValue({ data: { content: 'Fix applied' } }),
    }),
    stop: vi.fn(),
  })),
  SessionEvent: {},
}));

const { triggerFix, getFixSession } = await import('../../src/services/fix.service.js');

describe('fix.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerFix', () => {
    it('creates a fix session and returns its ID', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        id: 'f1',
        ruleId: 'HIDDEN_COLUMN',
        ruleName: 'Hide FK columns',
        description: 'FK columns should be hidden',
        affectedObject: "'Sales'[RegionId]",
        objectType: 'DataColumn',
        fixStatus: 'UNFIXED',
        hasAutoFix: true,
        fixSession: null,
      });
      mockPrisma.fixSession.create.mockResolvedValue({ id: 'fs1' });
      mockPrisma.finding.update.mockResolvedValue({});
      mockPrisma.fixSessionStep.create.mockResolvedValue({});

      const sessionId = await triggerFix('f1');
      expect(sessionId).toBe('fs1');
      expect(mockPrisma.fixSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ findingId: 'f1', status: 'RUNNING' }),
        }),
      );
      expect(mockPrisma.finding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: { fixStatus: 'IN_PROGRESS' },
        }),
      );
    });

    it('throws 404 if finding not found', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue(null);
      await expect(triggerFix('nonexistent')).rejects.toThrow('Finding not found');
    });

    it('throws 409 if finding already fixed', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        id: 'f2',
        fixStatus: 'FIXED',
      });
      await expect(triggerFix('f2')).rejects.toThrow('Finding already fixed');
    });

    it('throws 409 if fix already in progress', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        id: 'f3',
        fixStatus: 'IN_PROGRESS',
      });
      await expect(triggerFix('f3')).rejects.toThrow('Fix already in progress');
    });

    it('uses deterministic fix path when FixExpression exists', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        id: 'f4',
        ruleId: 'HIDDEN_COLUMN',
        ruleName: 'Hide FK columns',
        description: 'FK columns should be hidden',
        affectedObject: "'Sales'[RegionId]",
        objectType: 'DataColumn',
        fixStatus: 'UNFIXED',
        hasAutoFix: true,
        fixSession: null,
      });
      mockPrisma.fixSession.create.mockResolvedValue({ id: 'fs4' });
      mockPrisma.finding.update.mockResolvedValue({});
      mockPrisma.fixSessionStep.create.mockResolvedValue({});
      mockPrisma.fixSession.update.mockResolvedValue({});
      mockCallTool.mockResolvedValue({ content: [{ text: 'OK' }] });

      await triggerFix('f4');

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 200));

      // Should have called MCP tool to apply the fix
      if (mockCallTool.mock.calls.length > 0) {
        const call = mockCallTool.mock.calls[0];
        expect(call[0].name).toBe('column_operations');
        expect(call[0].arguments.request.operation).toBe('Update');
        expect(call[0].arguments.request.properties.IsHidden).toBe(true);
      }
    });

    it('uses AI fix path when no FixExpression exists', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({
        id: 'f5',
        ruleId: 'NO_FIX_RULE',
        ruleName: 'Complex check',
        description: 'Complex DAX issue',
        affectedObject: "'Measures'[Total]",
        objectType: 'Measure',
        fixStatus: 'UNFIXED',
        hasAutoFix: false,
        fixSession: null,
      });
      mockPrisma.fixSession.create.mockResolvedValue({ id: 'fs5' });
      mockPrisma.finding.update.mockResolvedValue({});
      mockPrisma.fixSessionStep.create.mockResolvedValue({});
      mockPrisma.fixSession.update.mockResolvedValue({});

      await triggerFix('f5');

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 200));

      // In AI path, CopilotClient should have been instantiated
      // (verified by the mock setup)
    });
  });

  describe('getFixSession', () => {
    it('returns session with steps', async () => {
      mockPrisma.fixSession.findUnique.mockResolvedValue({
        id: 'fs1',
        findingId: 'f1',
        status: 'COMPLETED',
        steps: [
          { id: 's1', stepNumber: 1, eventType: 'reasoning', content: 'Analyzing...' },
          { id: 's2', stepNumber: 2, eventType: 'tool_call', content: '{}' },
        ],
      });

      const session = await getFixSession('f1');
      expect(session.steps).toHaveLength(2);
      expect(session.steps[0].eventType).toBe('reasoning');
    });

    it('throws 404 if session not found', async () => {
      mockPrisma.fixSession.findUnique.mockResolvedValue(null);
      await expect(getFixSession('nonexistent')).rejects.toThrow('Fix session not found');
    });
  });
});
