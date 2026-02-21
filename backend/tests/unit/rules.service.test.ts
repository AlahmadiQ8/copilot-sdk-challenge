import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocking
const { getRulesForApi, getRawRules, clearRulesCache } = await import(
  '../../src/services/rules.service.js'
);

const sampleRules = [
  {
    ID: 'AVOID_FLOATING_POINT',
    Name: '[Performance] Avoid floating point data types',
    Category: 'Performance',
    Description: 'Do not use Double or Decimal data types when Int64 suffices.',
    Severity: 2,
    Scope: 'DataColumn, CalculatedColumn',
    Expression: 'DataType = DataType.Double',
    FixExpression: 'DataType = DataType.Decimal',
  },
  {
    ID: 'DAX_IFERROR',
    Name: '[DAX Expressions] Avoid IFERROR',
    Category: 'DAX Expressions',
    Description: 'Avoid using IFERROR in DAX expressions.',
    Severity: 3,
    Scope: 'Measure',
    Expression: 'RegEx.IsMatch(Expression, "IFERROR")',
  },
  {
    ID: 'NAMING_COLUMNS',
    Name: '[Naming Conventions] Column naming',
    Category: 'Naming Conventions',
    Description: 'Columns should use PascalCase.',
    Severity: 1,
    Scope: 'DataColumn',
    Expression: 'Name.Contains(" ")',
  },
];

describe('rules.service', () => {
  beforeEach(() => {
    clearRulesCache();
    mockFetch.mockReset();
  });

  it('fetches and parses rules from remote URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleRules,
    });

    const rules = await getRawRules();
    expect(rules).toHaveLength(3);
    expect(rules[0].ID).toBe('AVOID_FLOATING_POINT');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caches rules on subsequent calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleRules,
    });

    await getRawRules();
    await getRawRules();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns API-formatted rules via getRulesForApi', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleRules,
    });

    const apiRules = await getRulesForApi();
    expect(apiRules).toHaveLength(3);
    expect(apiRules[0]).toEqual({
      id: 'AVOID_FLOATING_POINT',
      name: '[Performance] Avoid floating point data types',
      category: 'Performance',
      description: 'Do not use Double or Decimal data types when Int64 suffices.',
      severity: 2,
      scope: 'DataColumn, CalculatedColumn',
      hasFixExpression: true,
    });
    expect(apiRules[1].hasFixExpression).toBe(false);
  });

  it('filters rules by category', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleRules,
    });

    const filtered = await getRulesForApi('Performance');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('Performance');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(getRawRules()).rejects.toThrow('Failed to fetch BPA rules');
  });

  it('handles rules wrapped in an object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Rules: sampleRules }),
    });

    const rules = await getRawRules();
    expect(rules).toHaveLength(3);
  });
});
