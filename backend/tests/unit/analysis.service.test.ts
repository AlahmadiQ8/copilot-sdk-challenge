import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MCP client
const mockCallTool = vi.fn();
vi.mock('../../src/mcp/client.js', () => ({
  getMcpClient: () => ({ callTool: mockCallTool }),
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
    count: vi.fn(),
  },
};
vi.mock('../../src/models/prisma.js', () => ({ default: mockPrisma }));

// Mock rules service with real rule IDs
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
      ID: 'AVOID_USING_THE_IFERROR_FUNCTION',
      Name: '[DAX Expressions] Avoid using the IFERROR function',
      Category: 'DAX Expressions',
      Severity: 2,
      Description: 'Avoid IFERROR',
    },
    {
      ID: 'REDUCE_NUMBER_OF_CALCULATED_COLUMNS',
      Name: '[Performance] Reduce number of calculated columns',
      Category: 'Performance',
      Severity: 2,
      Description: 'Too many calculated columns',
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

const { runAnalysis, getFindings } = await import('../../src/services/analysis.service.js');

// Helper to wrap rows into an MCP DAX response
const daxResponse = (rows: unknown[]) => ({
  content: [{ text: JSON.stringify({ success: true, data: rows }) }],
});
const emptyDaxResponse = () => daxResponse([]);

describe('analysis.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.analysisRun.create.mockResolvedValue({
      id: 'run-1',
      modelName: 'TestModel',
      status: 'RUNNING',
    });
  });

  it('creates an analysis run and returns its ID', async () => {
    mockCallTool.mockResolvedValue(emptyDaxResponse());

    const runId = await runAnalysis();
    expect(runId).toBe('run-1');
    expect(mockPrisma.analysisRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('creates findings from DAX column-rule results', async () => {
    mockCallTool.mockImplementation(({ arguments: args }: { arguments: { request: { query: string } } }) => {
      const query = args?.request?.query || '';
      if (query.includes('ExplicitDataType') && query.includes('= 8')) {
        return Promise.resolve(
          daxResponse([{ '[TableID]': 'Sales', '[ExplicitName]': 'Amount' }]),
        );
      }
      return Promise.resolve(emptyDaxResponse());
    });

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-2' });
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const findings = mockPrisma.finding.createMany.mock.calls[0][0].data;
    const floatFinding = findings.find(
      (f: { ruleId: string }) => f.ruleId === 'AVOID_FLOATING_POINT_DATA_TYPES',
    );
    expect(floatFinding).toBeDefined();
    expect(floatFinding.affectedObject).toContain('Amount');
    expect(floatFinding.severity).toBe(2);
  });

  it('creates findings from DAX measure-rule results', async () => {
    mockCallTool.mockImplementation(({ arguments: args }: { arguments: { request: { query: string } } }) => {
      const query = args?.request?.query || '';
      if (query.includes('IFERROR') && query.includes('INFO.MEASURES')) {
        return Promise.resolve(
          daxResponse([{ '[TableID]': 'Measures', '[Name]': 'SafeCalc' }]),
        );
      }
      return Promise.resolve(emptyDaxResponse());
    });

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-3' });
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const findings = mockPrisma.finding.createMany.mock.calls[0][0].data;
    const iferrorFinding = findings.find(
      (f: { ruleId: string }) => f.ruleId === 'AVOID_USING_THE_IFERROR_FUNCTION',
    );
    expect(iferrorFinding).toBeDefined();
    expect(iferrorFinding.affectedObject).toContain('SafeCalc');
  });

  it('evaluates threshold rules correctly', async () => {
    mockCallTool.mockImplementation(({ arguments: args }: { arguments: { request: { query: string } } }) => {
      const query = args?.request?.query || '';
      if (query.includes('CalcColCount')) {
        return Promise.resolve(daxResponse([{ '[CalcColCount]': 10 }]));
      }
      return Promise.resolve(emptyDaxResponse());
    });

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-4' });
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const findings = mockPrisma.finding.createMany.mock.calls[0][0].data;
    const calcColFinding = findings.find(
      (f: { ruleId: string }) => f.ruleId === 'REDUCE_NUMBER_OF_CALCULATED_COLUMNS',
    );
    expect(calcColFinding).toBeDefined();
    expect(calcColFinding.affectedObject).toBe('Model');
  });

  it('skips failed DAX queries gracefully', async () => {
    mockCallTool.mockRejectedValue(new Error('DAX query failed'));

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-5' });
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    expect(mockPrisma.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', errorCount: 0 }),
      }),
    );
  });

  it('deduplicates findings with same ruleId and affectedObject', async () => {
    // Both IFERROR entries (measure + calc column) return the same object name
    mockCallTool.mockImplementation(({ arguments: args }: { arguments: { request: { query: string } } }) => {
      const query = args?.request?.query || '';
      if (query.includes('IFERROR')) {
        return Promise.resolve(
          daxResponse([{ '[TableID]': 'Measures', '[Name]': 'BadCalc' }]),
        );
      }
      return Promise.resolve(emptyDaxResponse());
    });

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-6' });
    await runAnalysis();
    await new Promise((r) => setTimeout(r, 300));

    if (mockPrisma.finding.createMany.mock.calls.length > 0) {
      const findings = mockPrisma.finding.createMany.mock.calls[0][0].data;
      const iferrorFindings = findings.filter(
        (f: { ruleId: string }) => f.ruleId === 'AVOID_USING_THE_IFERROR_FUNCTION',
      );
      const keys = iferrorFindings.map(
        (f: { ruleId: string; affectedObject: string }) => `${f.ruleId}::${f.affectedObject}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
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
});
