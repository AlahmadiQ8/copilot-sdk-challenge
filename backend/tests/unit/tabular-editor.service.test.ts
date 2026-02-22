import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildRuleLookupMap,
  parseObjectReference,
  parseConsoleOutput,
  VIOLATION_REGEX,
  TABULAR_EDITOR_PATH_ENV,
  TABULAR_EDITOR_TIMEOUT_ENV,
} from '../../src/services/tabular-editor.service.js';

// ─── Sample Rules ────────────────────────────────────────────────────

const sampleRules = [
  {
    ID: 'AVOID_FLOATING_POINT_DATA_TYPES',
    Name: '[Performance] Avoid floating point data types',
    Category: 'Performance',
    Severity: 2,
    Description: 'Avoid using floating point data types.',
    FixExpression: 'DataType = DataType.Decimal',
  },
  {
    ID: 'DO_NOT_SUMMARIZE_NUMERIC_COLUMNS',
    Name: '[Formatting] Do not summarize numeric columns',
    Category: 'Formatting',
    Severity: 1,
    Description: 'Numeric columns should not be summarized.',
  },
  {
    ID: 'PERCENTAGE_FORMAT',
    Name: '[Formatting] Percentages should be formatted with thousands separators',
    Category: 'Formatting',
    Severity: 1,
    Description: 'Percentages should use proper formatting.',
  },
  {
    ID: 'STAR_SCHEMA',
    Name: '[Performance] Consider a star-schema',
    Category: 'Performance',
    Severity: 2,
    Description: 'Consider using a star-schema design.',
  },
  {
    ID: 'RELATIONSHIP_INACTIVE',
    Name: '[Maintenance] Remove inactive relationships',
    Category: 'Maintenance',
    Severity: 1,
    Description: 'Remove inactive relationships.',
    FixExpression: 'Delete()',
  },
];

// ─── buildRuleLookupMap ──────────────────────────────────────────────

describe('buildRuleLookupMap', () => {
  it('creates a map keyed by rule Name', () => {
    const map = buildRuleLookupMap(sampleRules);
    expect(map.size).toBe(5);
    expect(map.has('[Performance] Avoid floating point data types')).toBe(true);
    expect(map.has('[Formatting] Do not summarize numeric columns')).toBe(true);
  });

  it('maps rule metadata correctly', () => {
    const map = buildRuleLookupMap(sampleRules);
    const rule = map.get('[Performance] Avoid floating point data types');
    expect(rule).toEqual({
      id: 'AVOID_FLOATING_POINT_DATA_TYPES',
      name: '[Performance] Avoid floating point data types',
      category: 'Performance',
      severity: 2,
      description: 'Avoid using floating point data types.',
      hasFixExpression: true,
    });
  });

  it('sets hasFixExpression to false when FixExpression is absent', () => {
    const map = buildRuleLookupMap(sampleRules);
    const rule = map.get('[Formatting] Do not summarize numeric columns');
    expect(rule?.hasFixExpression).toBe(false);
  });

  it('sets hasFixExpression to true when FixExpression is present', () => {
    const map = buildRuleLookupMap(sampleRules);
    const rule = map.get('[Maintenance] Remove inactive relationships');
    expect(rule?.hasFixExpression).toBe(true);
  });

  it('returns undefined for unknown rule names', () => {
    const map = buildRuleLookupMap(sampleRules);
    expect(map.get('Nonexistent Rule')).toBeUndefined();
  });

  it('handles empty rules array', () => {
    const map = buildRuleLookupMap([]);
    expect(map.size).toBe(0);
  });
});

// ─── parseObjectReference ────────────────────────────────────────────

describe('parseObjectReference', () => {
  it('parses column with table: Column \'Table\'[Col]', () => {
    const ref = parseObjectReference("Column 'duration'[Total]");
    expect(ref.objectType).toBe('Column');
    expect(ref.tableName).toBe('duration');
    expect(ref.objectName).toBe('Total');
    expect(ref.affectedObject).toBe("'duration'[Total]");
  });

  it('parses measure without table: Measure [Name]', () => {
    const ref = parseObjectReference('Measure [VaR % of BV]');
    expect(ref.objectType).toBe('Measure');
    expect(ref.tableName).toBe('');
    expect(ref.objectName).toBe('VaR % of BV');
    expect(ref.affectedObject).toBe('[VaR % of BV]');
  });

  it('parses table only: Table \'Name\'', () => {
    const ref = parseObjectReference("Table 'ALM_tabl3'");
    expect(ref.objectType).toBe('Table');
    expect(ref.tableName).toBe('ALM_tabl3');
    expect(ref.objectName).toBe('');
    expect(ref.affectedObject).toBe("'ALM_tabl3'");
  });

  it('parses calculated table: \'Name\' (Calculated Table)', () => {
    const ref = parseObjectReference("'DateTableTemplate_xxx' (Calculated Table)");
    expect(ref.objectType).toBe('Calculated Table');
    expect(ref.tableName).toBe('DateTableTemplate_xxx');
    expect(ref.objectName).toBe('');
    expect(ref.affectedObject).toBe("'DateTableTemplate_xxx'");
  });

  it('parses relationship reference', () => {
    const ref = parseObjectReference("Relationship 'Sales'[ProductID] -> 'Product'[ID]");
    expect(ref.objectType).toBe('Relationship');
    // Table and object extraction for relationships — gets the first match
    expect(ref.tableName).toBe('Sales');
    expect(ref.objectName).toBe('ProductID');
  });

  it('parses column with special characters in names', () => {
    const ref = parseObjectReference("Column 'My Table (v2)'[Amount ($)]");
    expect(ref.objectType).toBe('Column');
    expect(ref.tableName).toBe('My Table (v2)');
    expect(ref.objectName).toBe('Amount ($)');
    expect(ref.affectedObject).toBe("'My Table (v2)'[Amount ($)]");
  });
});

// ─── parseConsoleOutput ──────────────────────────────────────────────

describe('parseConsoleOutput', () => {
  const ruleLookup = buildRuleLookupMap(sampleRules);

  it('parses column violation line', () => {
    const stdout = `Column 'duration'[Total] violates rule "[Formatting] Do not summarize numeric columns"`;
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('DO_NOT_SUMMARIZE_NUMERIC_COLUMNS');
    expect(findings[0].affectedObject).toBe("'duration'[Total]");
    expect(findings[0].objectType).toBe('Column');
    expect(findings[0].severity).toBe(1);
    expect(findings[0].hasAutoFix).toBe(false);
  });

  it('parses measure violation line', () => {
    const stdout = `Measure [VaR % of BV] violates rule "[Formatting] Percentages should be formatted with thousands separators"`;
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('PERCENTAGE_FORMAT');
    expect(findings[0].affectedObject).toBe('[VaR % of BV]');
    expect(findings[0].objectType).toBe('Measure');
  });

  it('parses table violation line', () => {
    const stdout = `Table 'ALM_tabl3' violates rule "[Performance] Consider a star-schema"`;
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('STAR_SCHEMA');
    expect(findings[0].affectedObject).toBe("'ALM_tabl3'");
    expect(findings[0].objectType).toBe('Table');
  });

  it('parses multiple violations', () => {
    const stdout = [
      `Column 'Sales'[Amount] violates rule "[Performance] Avoid floating point data types"`,
      `Table 'ALM_tabl3' violates rule "[Performance] Consider a star-schema"`,
      `Measure [VaR % of BV] violates rule "[Formatting] Percentages should be formatted with thousands separators"`,
    ].join('\n');
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(3);
  });

  it('returns empty array for empty output', () => {
    expect(parseConsoleOutput('', ruleLookup)).toEqual([]);
  });

  it('skips lines that do not match violation pattern', () => {
    const stdout = [
      'Loading model...',
      'Connected to localhost:12345',
      `Column 'Sales'[Amount] violates rule "[Performance] Avoid floating point data types"`,
      'Analysis complete.',
    ].join('\n');
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('AVOID_FLOATING_POINT_DATA_TYPES');
  });

  it('skips violations with unknown rule names', () => {
    const stdout = `Column 'Sales'[X] violates rule "Unknown Rule That Does Not Exist"`;
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(0);
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const stdout = `Column 'A'[B] violates rule "[Performance] Avoid floating point data types"\r\nTable 'C' violates rule "[Performance] Consider a star-schema"\r\n`;
    const findings = parseConsoleOutput(stdout, ruleLookup);
    expect(findings).toHaveLength(2);
  });
});

// ─── VIOLATION_REGEX ─────────────────────────────────────────────────

describe('VIOLATION_REGEX', () => {
  it('matches standard violation line', () => {
    const line = `Column 'Sales'[Amount] violates rule "[Performance] Avoid floating point"`;
    const match = line.match(VIOLATION_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Column 'Sales'[Amount]");
    expect(match![2]).toBe('[Performance] Avoid floating point');
  });

  it('does not match non-violation lines', () => {
    expect('Loading model...'.match(VIOLATION_REGEX)).toBeNull();
    expect('Analysis complete.'.match(VIOLATION_REGEX)).toBeNull();
    expect(''.match(VIOLATION_REGEX)).toBeNull();
  });
});

// ─── validateTabularEditorPath ───────────────────────────────────────

describe('validateTabularEditorPath', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[TABULAR_EDITOR_PATH_ENV];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[TABULAR_EDITOR_PATH_ENV] = originalEnv;
    } else {
      delete process.env[TABULAR_EDITOR_PATH_ENV];
    }
  });

  it('throws when TABULAR_EDITOR_PATH is not set', async () => {
    delete process.env[TABULAR_EDITOR_PATH_ENV];
    const { validateTabularEditorPath } = await import('../../src/services/tabular-editor.service.js');
    await expect(validateTabularEditorPath()).rejects.toThrow('not configured');
  });

  it('throws when path points to non-existent file', async () => {
    process.env[TABULAR_EDITOR_PATH_ENV] = 'C:\\nonexistent\\TabularEditor.exe';
    const { validateTabularEditorPath } = await import('../../src/services/tabular-editor.service.js');
    await expect(validateTabularEditorPath()).rejects.toThrow('not found at');
  });

  it('resolves with path when file exists', async () => {
    // Use a known-existing file for the test
    process.env[TABULAR_EDITOR_PATH_ENV] = process.execPath; // node.exe always exists
    const { validateTabularEditorPath } = await import('../../src/services/tabular-editor.service.js');
    const result = await validateTabularEditorPath();
    expect(result).toBe(process.execPath);
  });
});

// ─── runTabularEditor ────────────────────────────────────────────────

describe('runTabularEditor', () => {
  let originalPath: string | undefined;
  let originalTimeout: string | undefined;

  beforeEach(() => {
    originalPath = process.env[TABULAR_EDITOR_PATH_ENV];
    originalTimeout = process.env[TABULAR_EDITOR_TIMEOUT_ENV];
  });

  afterEach(() => {
    if (originalPath !== undefined) {
      process.env[TABULAR_EDITOR_PATH_ENV] = originalPath;
    } else {
      delete process.env[TABULAR_EDITOR_PATH_ENV];
    }
    if (originalTimeout !== undefined) {
      process.env[TABULAR_EDITOR_TIMEOUT_ENV] = originalTimeout;
    } else {
      delete process.env[TABULAR_EDITOR_TIMEOUT_ENV];
    }
  });

  it('rejects when TABULAR_EDITOR_PATH is not set', async () => {
    delete process.env[TABULAR_EDITOR_PATH_ENV];
    const { runTabularEditor } = await import('../../src/services/tabular-editor.service.js');
    await expect(runTabularEditor('localhost:1234', 'db', 'rules.json')).rejects.toThrow('not configured');
  });

  it('rejects when executable does not exist', async () => {
    process.env[TABULAR_EDITOR_PATH_ENV] = 'C:\\nonexistent\\TabularEditor.exe';
    const { runTabularEditor } = await import('../../src/services/tabular-editor.service.js');
    await expect(runTabularEditor('localhost:1234', 'db', 'rules.json')).rejects.toThrow('not found at');
  });
});
