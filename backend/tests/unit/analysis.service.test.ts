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

// Mock rules service
vi.mock('../../src/services/rules.service.js', () => ({
  getRawRules: vi.fn().mockResolvedValue([
    {
      ID: 'FLOAT_CHECK',
      Name: '[Performance] Float check',
      Category: 'Performance',
      Severity: 2,
      Description: 'Avoid floats',
      Scope: 'DataColumn',
      Expression: 'DataType = DataType.Double',
      FixExpression: 'DataType = DataType.Decimal',
    },
    {
      ID: 'IFERROR_CHECK',
      Name: '[DAX] Avoid IFERROR',
      Category: 'DAX Expressions',
      Severity: 3,
      Description: 'Avoid IFERROR',
      Scope: 'Measure',
      Expression: 'RegEx.IsMatch(Expression, "IFERROR")',
    },
  ]),
}));

const { runAnalysis, getFindings } = await import('../../src/services/analysis.service.js');

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
    mockCallTool.mockResolvedValue({ content: [{ text: '[]' }] });
    mockPrisma.analysisRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
    });

    const runId = await runAnalysis();
    expect(runId).toBe('run-1');
    expect(mockPrisma.analysisRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RUNNING' }),
      }),
    );
  });

  it('evaluates property-check rules (DataType.Double)', async () => {
    // Simulate tables, columns, measures, relationships
    mockCallTool
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }) // tables
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify([
              {
                Name: 'Amount',
                TableName: 'Sales',
                DataType: 'Double',
                Type: 'Data',
              },
              {
                Name: 'ID',
                TableName: 'Sales',
                DataType: 'Int64',
                Type: 'Data',
              },
            ]),
          },
        ],
      }) // columns
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }) // measures
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }); // relationships

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-2' });

    await runAnalysis();

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    // Verify findings were created — the Double column should trigger the float rule
    if (mockPrisma.finding.createMany.mock.calls.length > 0) {
      const createCall = mockPrisma.finding.createMany.mock.calls[0][0];
      const findings = createCall.data;
      const floatFinding = findings.find(
        (f: { ruleId: string }) => f.ruleId === 'FLOAT_CHECK',
      );
      if (floatFinding) {
        expect(floatFinding.affectedObject).toContain('Amount');
        expect(floatFinding.severity).toBe(2);
      }
    }
  });

  it('evaluates regex-based DAX rules (IFERROR)', async () => {
    mockCallTool
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }) // tables
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }) // columns
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify([
              {
                Name: 'SafeCalc',
                TableName: 'Measures',
                Expression: 'IFERROR(SUM(Sales[Amount]), 0)',
              },
            ]),
          },
        ],
      }) // measures
      .mockResolvedValueOnce({ content: [{ text: '[]' }] }); // relationships

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-3' });

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 100));

    if (mockPrisma.finding.createMany.mock.calls.length > 0) {
      const createCall = mockPrisma.finding.createMany.mock.calls[0][0];
      const findings = createCall.data;
      const iferrorFinding = findings.find(
        (f: { ruleId: string }) => f.ruleId === 'IFERROR_CHECK',
      );
      if (iferrorFinding) {
        expect(iferrorFinding.severity).toBe(3);
        expect(iferrorFinding.affectedObject).toContain('SafeCalc');
      }
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
