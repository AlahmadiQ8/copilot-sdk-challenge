import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tabular Editor service
const mockEvaluateRules = vi.fn();
vi.mock('../../src/services/tabular-editor.service.js', () => ({
  evaluateRulesWithTabularEditor: mockEvaluateRules,
  validateTabularEditorPath: vi.fn().mockResolvedValue('C:\\TE\\TabularEditor.exe'),
}));

// Mock MCP client — getConnectionStatus still needed for runAnalysis guard
vi.mock('../../src/mcp/client.js', () => ({
  getMcpClient: () => ({ callTool: vi.fn() }),
  getConnectionStatus: () => ({
    connected: true,
    databaseName: 'TestModel',
    serverAddress: 'localhost:12345',
  }),
}));

// Mock Prisma
const mockPrisma = {
  analysisRun: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  finding: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
};
vi.mock('../../src/models/prisma.js', () => ({ default: mockPrisma }));

// Mock rules service
vi.mock('../../src/services/rules.service.js', () => ({
  getRawRules: vi.fn().mockResolvedValue([
    {
      ID: 'AVOID_FLOATING_POINT_DATA_TYPES',
      Name: '[Performance] Avoid floating point data types',
      Category: 'Performance',
      Severity: 2,
      Description: 'Avoid floats',
      FixExpression: 'DataType = DataType.Decimal',
    },
    {
      ID: 'OBJECTS_WITH_NO_DESCRIPTION',
      Name: '[Maintenance] Objects with no description',
      Category: 'Maintenance',
      Severity: 1,
      Description: 'Add descriptions',
    },
  ]),
}));

const { runAnalysis, getFindings, recheckFinding } = await import('../../src/services/analysis.service.js');

const runRecord = {
  id: 'run-1',
  modelName: 'TestModel',
  serverAddress: 'localhost:12345',
  databaseName: 'TestModel',
  status: 'RUNNING',
};

describe('analysis.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.analysisRun.create.mockResolvedValue({ ...runRecord });
    mockPrisma.analysisRun.findUnique.mockResolvedValue({ ...runRecord });
    mockEvaluateRules.mockResolvedValue([]);
  });

  it('creates an analysis run and returns its ID', async () => {
    const runId = await runAnalysis();
    expect(runId).toBe('run-1');
    expect(mockPrisma.analysisRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RUNNING', databaseName: 'TestModel' }),
      }),
    );
  });

  it('calls evaluateRulesWithTabularEditor with correct parameters', async () => {
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockEvaluateRules).toHaveBeenCalledWith(
      'localhost:12345',
      'TestModel',
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('persists findings from Tabular Editor results', async () => {
    mockEvaluateRules.mockResolvedValue([
      {
        ruleId: 'AVOID_FLOATING_POINT_DATA_TYPES',
        ruleName: '[Performance] Avoid floating point data types',
        category: 'Performance',
        severity: 2,
        description: 'Avoid floats',
        affectedObject: "'Sales'[Amount]",
        objectType: 'Column',
        hasAutoFix: true,
      },
      {
        ruleId: 'OBJECTS_WITH_NO_DESCRIPTION',
        ruleName: '[Maintenance] Objects with no description',
        category: 'Maintenance',
        severity: 1,
        description: 'Add descriptions',
        affectedObject: "'Products'",
        objectType: 'Table',
        hasAutoFix: false,
      },
    ]);

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const findings = mockPrisma.finding.createMany.mock.calls[0][0].data;
    expect(findings).toHaveLength(2);
    expect(findings[0].ruleId).toBe('AVOID_FLOATING_POINT_DATA_TYPES');
    expect(findings[0].affectedObject).toBe("'Sales'[Amount]");
    expect(findings[0].severity).toBe(2);
    expect(findings[1].ruleId).toBe('OBJECTS_WITH_NO_DESCRIPTION');
  });

  it('transitions status to COMPLETED with correct counts', async () => {
    mockEvaluateRules.mockResolvedValue([
      { ruleId: 'R1', ruleName: 'R1', category: 'C', severity: 3, description: '', affectedObject: 'A', objectType: 'T', hasAutoFix: false },
      { ruleId: 'R2', ruleName: 'R2', category: 'C', severity: 2, description: '', affectedObject: 'B', objectType: 'T', hasAutoFix: false },
      { ruleId: 'R3', ruleName: 'R3', category: 'C', severity: 1, description: '', affectedObject: 'C', objectType: 'T', hasAutoFix: false },
    ]);

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          errorCount: 1,
          warningCount: 1,
          infoCount: 1,
        }),
      }),
    );
  });

  it('marks analysis as FAILED when TE service throws', async () => {
    mockEvaluateRules.mockRejectedValue(new Error('Tabular Editor analysis timed out'));

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('completes with zero counts when no findings', async () => {
    mockEvaluateRules.mockResolvedValue([]);

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.finding.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
        }),
      }),
    );
  });

  it('getFindings returns filtered and paginated results', async () => {
    const mockFindings = [
      { id: 'f1', severity: 3, fixStatus: 'UNFIXED' },
      { id: 'f2', severity: 2, fixStatus: 'FIXED' },
    ];
    mockPrisma.finding.findMany.mockResolvedValue(mockFindings);
    mockPrisma.finding.count.mockResolvedValue(2);

    const result = await getFindings('run-1', { limit: 10, offset: 0 });
    expect(result.findings).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  // ─── recheckFinding tests ─────────────────────────────────────────

  describe('recheckFinding', () => {
    const existingFinding = {
      id: 'f-1',
      analysisRunId: 'run-1',
      ruleId: 'AVOID_FLOATING_POINT_DATA_TYPES',
      ruleName: '[Performance] Avoid floating point data types',
      affectedObject: "'Sales'[Amount]",
      objectType: 'Column',
      fixStatus: 'UNFIXED',
      fixSummary: null,
    };

    beforeEach(() => {
      mockPrisma.finding.findUnique.mockResolvedValue({ ...existingFinding });
      mockPrisma.finding.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...existingFinding, ...data }),
      );
    });

    it('returns UNFIXED when violation is still present', async () => {
      mockEvaluateRules.mockResolvedValue([
        { ruleId: 'AVOID_FLOATING_POINT_DATA_TYPES', affectedObject: "'Sales'[Amount]", ruleName: 'R', category: 'C', severity: 2, description: '', objectType: 'Column', hasAutoFix: true },
      ]);

      const result = await recheckFinding('f-1');
      expect(result.fixStatus).toBe('UNFIXED');
      expect(result.resolved).toBe(false);
    });

    it('returns FIXED when violation is gone', async () => {
      mockEvaluateRules.mockResolvedValue([]);

      const result = await recheckFinding('f-1');
      expect(result.fixStatus).toBe('FIXED');
      expect(result.resolved).toBe(true);
      expect(mockPrisma.finding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fixStatus: 'FIXED', fixSummary: 'Verified fixed via recheck' }),
        }),
      );
    });

    it('throws 404 when finding not found', async () => {
      mockPrisma.finding.findUnique.mockResolvedValue(null);
      await expect(recheckFinding('nonexistent')).rejects.toThrow('Finding not found');
    });

    it('throws 422 when not connected', async () => {
      // Override getConnectionStatus for this test
      const mod = await import('../../src/mcp/client.js');
      const spy = vi.spyOn(mod, 'getConnectionStatus').mockReturnValue({
        connected: false,
        databaseName: '',
        serverAddress: '',
      } as ReturnType<typeof mod.getConnectionStatus>);

      await expect(recheckFinding('f-1')).rejects.toThrow('No model connected');
      spy.mockRestore();
    });
  });

  // ─── Graceful Degradation (US4) ────────────────────────────────────

  describe('graceful degradation', () => {
    it('marks run FAILED when TE times out', async () => {
      mockEvaluateRules.mockRejectedValue(new Error('Tabular Editor analysis timed out after 120 seconds'));

      await runAnalysis();
      await new Promise((r) => setTimeout(r, 300));

      expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('marks run FAILED when TE crashes', async () => {
      mockEvaluateRules.mockRejectedValue(new Error('Tabular Editor analysis failed: segfault'));

      await runAnalysis();
      await new Promise((r) => setTimeout(r, 300));

      expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('marks run FAILED when TE path is misconfigured', async () => {
      mockEvaluateRules.mockRejectedValue(
        Object.assign(new Error('TABULAR_EDITOR_PATH environment variable is not configured'), { statusCode: 422 }),
      );

      await runAnalysis();
      await new Promise((r) => setTimeout(r, 300));

      expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
