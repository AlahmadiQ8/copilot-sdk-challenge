import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs.readFileSync
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'fs';

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

// Import after mocking
const { getRulesForApi, getRawRules, clearRulesCache } = await import(
  '../../src/services/rules.service.js'
);

describe('rules.service', () => {
  beforeEach(() => {
    clearRulesCache();
    vi.mocked(readFileSync).mockReset();
  });

  it('loads and parses rules from local file', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(sampleRules));

    const rules = await getRawRules();
    expect(rules).toHaveLength(3);
    expect(rules[0].ID).toBe('AVOID_FLOATING_POINT');
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it('caches rules on subsequent calls', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(sampleRules));

    await getRawRules();
    await getRawRules();
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it('returns API-formatted rules via getRulesForApi', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(sampleRules));

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
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(sampleRules));

    const filtered = await getRulesForApi('Performance');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('Performance');
  });

  it('throws on missing file', async () => {
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    await expect(getRawRules()).rejects.toThrow('ENOENT');
  });

  it('handles rules wrapped in an object', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ Rules: sampleRules }));

    const rules = await getRawRules();
    expect(rules).toHaveLength(3);
  });
});
