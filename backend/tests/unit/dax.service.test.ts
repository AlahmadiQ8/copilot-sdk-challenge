import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockDaxQueryCreate = vi.fn();
const mockDaxQueryUpdate = vi.fn();
const mockDaxQueryFindUnique = vi.fn();
const mockDaxQueryFindMany = vi.fn();
const mockDaxQueryCount = vi.fn();

vi.mock('../../src/models/prisma.js', () => ({
  default: {
    daxQuery: {
      create: (...args: unknown[]) => mockDaxQueryCreate(...args),
      update: (...args: unknown[]) => mockDaxQueryUpdate(...args),
      findUnique: (...args: unknown[]) => mockDaxQueryFindUnique(...args),
      findMany: (...args: unknown[]) => mockDaxQueryFindMany(...args),
      count: () => mockDaxQueryCount(),
    },
  },
}));

// Mock MCP client
const mockCallTool = vi.fn();
vi.mock('../../src/mcp/client.js', () => ({
  getMcpClient: () => ({ callTool: mockCallTool }),
  getConnectionStatus: () => ({ connected: true }),
}));

// Mock logger
vi.mock('../../src/middleware/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  childLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

const { executeDax, validateDax, getDaxQuery, getDaxHistory, cancelDaxQuery } = await import(
  '../../src/services/dax.service.js'
);

describe('dax.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeDax', () => {
    it('creates a DAX query and returns its ID', async () => {
      mockDaxQueryCreate.mockResolvedValue({ id: 'q1' });
      mockCallTool.mockResolvedValue({
        content: [{ text: JSON.stringify({ columns: [], rows: [] }) }],
      });
      mockDaxQueryUpdate.mockResolvedValue({});

      const id = await executeDax("EVALUATE 'Sales'");
      expect(id).toBe('q1');
      expect(mockDaxQueryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ queryText: "EVALUATE 'Sales'", status: 'RUNNING' }),
        }),
      );
    });
  });

  describe('validateDax', () => {
    it('returns valid for a correct query', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ text: JSON.stringify({ valid: true }) }],
      });

      const result = await validateDax("EVALUATE 'Sales'");
      expect(result.valid).toBe(true);
    });

    it('returns invalid with error message on failure', async () => {
      mockCallTool.mockRejectedValue(new Error('Invalid syntax'));

      const result = await validateDax('BAD QUERY');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid syntax');
    });
  });

  describe('getDaxQuery', () => {
    it('returns parsed query result', async () => {
      mockDaxQueryFindUnique.mockResolvedValue({
        id: 'q1',
        queryText: "EVALUATE 'Sales'",
        status: 'COMPLETED',
        resultData: JSON.stringify({
          columns: [{ name: 'Amount', dataType: 'number' }],
          rows: [{ Amount: 100 }],
        }),
        rowCount: 1,
        executionTimeMs: 50,
        errorMessage: null,
      });

      const result = await getDaxQuery('q1');
      expect(result.id).toBe('q1');
      expect(result.columns).toHaveLength(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
    });

    it('throws 404 for non-existent query', async () => {
      mockDaxQueryFindUnique.mockResolvedValue(null);
      await expect(getDaxQuery('missing')).rejects.toThrow('DAX query not found');
    });
  });

  describe('getDaxHistory', () => {
    it('returns paginated history', async () => {
      mockDaxQueryFindMany.mockResolvedValue([
        {
          id: 'q1',
          queryText: "EVALUATE 'Sales'",
          naturalLanguage: null,
          status: 'COMPLETED',
          rowCount: 5,
          executionTimeMs: 100,
          errorMessage: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      mockDaxQueryCount.mockResolvedValue(1);

      const result = await getDaxHistory(10, 0);
      expect(result.queries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.queries[0].queryText).toBe("EVALUATE 'Sales'");
    });
  });

  describe('cancelDaxQuery', () => {
    it('cancels a running query', async () => {
      mockDaxQueryFindUnique.mockResolvedValue({ id: 'q1', status: 'RUNNING' });
      mockDaxQueryUpdate.mockResolvedValue({});

      await cancelDaxQuery('q1');
      expect(mockDaxQueryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q1' },
          data: expect.objectContaining({ status: 'FAILED', errorMessage: 'Cancelled by user' }),
        }),
      );
    });

    it('throws 404 for non-existent query', async () => {
      mockDaxQueryFindUnique.mockResolvedValue(null);
      await expect(cancelDaxQuery('missing')).rejects.toThrow('DAX query not found');
    });

    it('throws 409 for non-running query', async () => {
      mockDaxQueryFindUnique.mockResolvedValue({ id: 'q1', status: 'COMPLETED' });
      await expect(cancelDaxQuery('q1')).rejects.toThrow('Query is not running');
    });
  });
});
