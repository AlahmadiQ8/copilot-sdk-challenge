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

// Helper to create an empty MCP response
const emptyResponse = () => ({ content: [{ text: JSON.stringify({ success: true, data: [] }) }] });
// Helper to create stats response with no tables
const emptyStats = () => ({ content: [{ text: JSON.stringify({ success: true, data: { Tables: [] } }) }] });

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
    // fetchModelMetadata: 4 parallel calls (tables, columns, rels, stats) + 1 fallback measure List
    mockCallTool
      .mockResolvedValueOnce(emptyResponse()) // table_operations List
      .mockResolvedValueOnce(emptyResponse()) // column_operations List
      .mockResolvedValueOnce(emptyResponse()) // relationship_operations List
      .mockResolvedValueOnce(emptyStats())    // model_operations GetStats
      .mockResolvedValueOnce(emptyResponse()); // measure_operations List (fallback)

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
    // 4 parallel calls (tables, columns, rels, stats) + 1 fallback measure List
    mockCallTool
      .mockResolvedValueOnce(emptyResponse()) // table_operations List
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify({
              success: true,
              data: [
                {
                  tableName: 'Sales',
                  columns: [
                    { name: 'Amount', dataType: 'Double' },
                    { name: 'ID', dataType: 'Int64' },
                  ],
                },
              ],
            }),
          },
        ],
      }) // column_operations List
      .mockResolvedValueOnce(emptyResponse()) // relationship_operations List
      .mockResolvedValueOnce(emptyStats())    // model_operations GetStats
      .mockResolvedValueOnce(emptyResponse()); // measure_operations List (fallback)

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-2' });

    await runAnalysis();

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 200));

    // Verify findings were created — the Double column should trigger the float rule
    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const createCall = mockPrisma.finding.createMany.mock.calls[0][0];
    const findings = createCall.data;
    const floatFinding = findings.find(
      (f: { ruleId: string }) => f.ruleId === 'FLOAT_CHECK',
    );
    expect(floatFinding).toBeDefined();
    expect(floatFinding.affectedObject).toContain('Amount');
    expect(floatFinding.severity).toBe(2);
  });

  it('evaluates regex-based DAX rules (IFERROR)', async () => {
    // 4 parallel + stats has table with measure → table Get + measure Get
    mockCallTool
      .mockResolvedValueOnce(emptyResponse()) // table_operations List
      .mockResolvedValueOnce(emptyResponse()) // column_operations List
      .mockResolvedValueOnce(emptyResponse()) // relationship_operations List
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify({
              success: true,
              data: { Tables: [{ name: 'Measures', measureCount: 1, isHidden: false }] },
            }),
          },
        ],
      }) // model_operations GetStats
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify({
              success: true,
              data: [{ name: 'Measures', measures: ['SafeCalc'] }],
            }),
          },
        ],
      }) // table_operations Get (batch) — returns data as array
      .mockResolvedValueOnce({
        content: [
          {
            text: JSON.stringify({
              success: true,
              data: [
                {
                  name: 'SafeCalc',
                  tableName: 'Measures',
                  expression: 'IFERROR(SUM(Sales[Amount]), 0)',
                },
              ],
            }),
          },
        ],
      }); // measure_operations Get (batch) — returns data as array

    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-3' });

    await runAnalysis();
    await new Promise((r) => setTimeout(r, 200));

    expect(mockPrisma.finding.createMany).toHaveBeenCalled();
    const createCall = mockPrisma.finding.createMany.mock.calls[0][0];
    const findings = createCall.data;
    const iferrorFinding = findings.find(
      (f: { ruleId: string }) => f.ruleId === 'IFERROR_CHECK',
    );
    expect(iferrorFinding).toBeDefined();
    expect(iferrorFinding.severity).toBe(3);
    expect(iferrorFinding.affectedObject).toContain('SafeCalc');
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
