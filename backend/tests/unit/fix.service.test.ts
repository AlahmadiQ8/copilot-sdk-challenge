import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  finding: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  bulkFixSession: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  bulkFixSessionStep: {
    create: vi.fn(),
  },
};
vi.mock('../../src/models/prisma.js', () => ({ default: mockPrisma }));

// Mock MCP client
const mockCallTool = vi.fn();
vi.mock('../../src/mcp/client.js', () => ({
  getConnectionStatus: () => ({
    connected: true,
    databaseName: 'TestModel',
    serverAddress: 'localhost:61460',
    catalogName: '432a98c1-test-guid',
  }),
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

// Mock tabular-editor.service for TE fix
const mockGenerateFixScript = vi.fn().mockReturnValue('var obj = ...; obj.IsHidden = true;');
const mockRunTabularEditorScript = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
vi.mock('../../src/services/tabular-editor.service.js', () => ({
  generateFixScript: (...args: unknown[]) => mockGenerateFixScript(...args),
  runTabularEditorScript: (...args: unknown[]) => mockRunTabularEditorScript(...args),
}));

const { triggerBulkFix, getBulkFixSession, applyTeFix } = await import('../../src/services/fix.service.js');

describe('fix.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerBulkFix', () => {
    it('creates a bulk fix session and marks findings in progress', async () => {
      const mockFindings = [
        {
          id: 'f1',
          ruleId: 'HIDDEN_COLUMN',
          ruleName: 'Hide FK columns',
          description: 'FK columns should be hidden',
          affectedObject: "'Sales'[RegionId]",
          objectType: 'DataColumn',
          fixStatus: 'UNFIXED',
          hasAutoFix: true,
        },
        {
          id: 'f2',
          ruleId: 'HIDDEN_COLUMN',
          ruleName: 'Hide FK columns',
          description: 'FK columns should be hidden',
          affectedObject: "'Sales'[ProductId]",
          objectType: 'DataColumn',
          fixStatus: 'UNFIXED',
          hasAutoFix: true,
        },
      ];
      mockPrisma.finding.findMany.mockResolvedValue(mockFindings);
      mockPrisma.bulkFixSession.create.mockResolvedValue({ id: 'bfs1' });
      mockPrisma.finding.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.bulkFixSessionStep.create.mockResolvedValue({});
      mockPrisma.bulkFixSession.update.mockResolvedValue({});
      mockPrisma.finding.update.mockResolvedValue({});

      const sessionId = await triggerBulkFix('HIDDEN_COLUMN', 'run1');
      expect(sessionId).toBe('bfs1');
      expect(mockPrisma.bulkFixSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ruleId: 'HIDDEN_COLUMN',
            analysisRunId: 'run1',
            status: 'RUNNING',
            totalFindings: 2,
          }),
        }),
      );
      expect(mockPrisma.finding.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['f1', 'f2'] } },
          data: { fixStatus: 'IN_PROGRESS' },
        }),
      );
    });

    it('throws 404 if no unfixed findings exist', async () => {
      mockPrisma.finding.findMany.mockResolvedValue([]);
      await expect(triggerBulkFix('HIDDEN_COLUMN', 'run1')).rejects.toThrow(
        'No unfixed findings for this rule',
      );
    });
  });

  describe('getBulkFixSession', () => {
    it('returns session with steps', async () => {
      mockPrisma.bulkFixSession.findUnique.mockResolvedValue({
        id: 'bfs1',
        ruleId: 'HIDDEN_COLUMN',
        status: 'COMPLETED',
        totalFindings: 3,
        fixedCount: 3,
        failedCount: 0,
        steps: [
          { id: 's1', stepNumber: 1, eventType: 'reasoning', content: 'Bulk fixing...' },
          { id: 's2', stepNumber: 2, eventType: 'tool_call', content: '{}' },
        ],
      });

      const session = await getBulkFixSession('bfs1');
      expect(session.steps).toHaveLength(2);
      expect(session.totalFindings).toBe(3);
      expect(session.fixedCount).toBe(3);
    });

    it('throws 404 if session not found', async () => {
      mockPrisma.bulkFixSession.findUnique.mockResolvedValue(null);
      await expect(getBulkFixSession('nonexistent')).rejects.toThrow('Bulk fix session not found');
    });
  });

  describe('applyTeFix', () => {
    const baseFinding = {
      id: 'f1',
      ruleId: 'HIDDEN_COLUMN',
      ruleName: '[Maintenance] Hide foreign key columns',
      category: 'Maintenance',
      severity: 2,
      description: 'FK columns should be hidden',
      affectedObject: "'Sales'[RegionId]",
      objectType: 'DataColumn',
      fixStatus: 'UNFIXED',
      hasAutoFix: true,
    };

    it('applies TE fix successfully and marks finding as FIXED', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue(baseFinding);
      mockPrisma.finding.update.mockResolvedValue({});
      mockRunTabularEditorScript.mockResolvedValue({ stdout: 'Success', stderr: '' });

      const result = await applyTeFix('f1');
      expect(result.status).toBe('FIXED');
      expect(result.fixSummary).toContain('IsHidden = true');

      // Should mark as IN_PROGRESS first, then FIXED
      expect(mockPrisma.finding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: { fixStatus: 'IN_PROGRESS' },
        }),
      );
      expect(mockPrisma.finding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({ fixStatus: 'FIXED' }),
        }),
      );

      // Should call generateFixScript with correct args
      expect(mockGenerateFixScript).toHaveBeenCalledWith('DataColumn', "'Sales'[RegionId]", 'IsHidden = true');

      // Should call runTabularEditorScript with server/db from connection status
      expect(mockRunTabularEditorScript).toHaveBeenCalledWith(
        'localhost:61460',
        '432a98c1-test-guid',
        expect.any(String),
      );
    });

    it('throws 404 when finding not found', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue(null);
      await expect(applyTeFix('nonexistent')).rejects.toThrow('Finding not found');
    });

    it('throws 409 when finding is already fixed', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({ ...baseFinding, fixStatus: 'FIXED' });
      await expect(applyTeFix('f1')).rejects.toThrow('already fixed');
    });

    it('throws 422 when finding has no auto-fix', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({ ...baseFinding, hasAutoFix: false });
      await expect(applyTeFix('f1')).rejects.toThrow('does not have an auto-fix');
    });

    it('throws 422 when rule has no FixExpression', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue({ ...baseFinding, ruleId: 'NO_FIX_RULE' });
      await expect(applyTeFix('f1')).rejects.toThrow('No FixExpression found');
    });

    it('marks finding as FAILED when TE script fails', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue(baseFinding);
      mockPrisma.finding.update.mockResolvedValue({});
      mockRunTabularEditorScript.mockRejectedValue(new Error('Script execution error'));

      await expect(applyTeFix('f1')).rejects.toThrow('TE fix failed');

      expect(mockPrisma.finding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({ fixStatus: 'FAILED' }),
        }),
      );
    });
  });
});
