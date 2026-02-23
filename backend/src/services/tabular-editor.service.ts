import { execFile } from 'child_process';
import { access, constants, writeFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { childLogger } from '../middleware/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────

export const TABULAR_EDITOR_PATH_ENV = 'TABULAR_EDITOR_PATH';
export const TABULAR_EDITOR_TIMEOUT_ENV = 'TABULAR_EDITOR_TIMEOUT';
export const DEFAULT_TIMEOUT = 120_000;
export const VIOLATION_REGEX = /^(.+?) violates rule "(.+)"$/;
export const BPA_RULES_PATH = join(__dirname, '..', 'data', 'bpa-rules.json');

// ─── Types ───────────────────────────────────────────────────────────

export interface RuleMetadata {
  id: string;
  name: string;
  category: string;
  severity: number;
  description: string;
  hasFixExpression: boolean;
}

export interface ParsedFinding {
  ruleId: string;
  ruleName: string;
  category: string;
  severity: number;
  description: string;
  affectedObject: string;
  objectType: string;
  hasAutoFix: boolean;
}

export interface ObjectReference {
  objectType: string;
  tableName: string;
  objectName: string;
  affectedObject: string;
}

export type RuleLookupMap = Map<string, RuleMetadata>;

// ─── Rule Lookup Map ─────────────────────────────────────────────────

export function buildRuleLookupMap(
  rules: Array<{ ID: string; Name: string; Category: string; Severity: number; Description: string; FixExpression?: string }>,
): RuleLookupMap {
  const map: RuleLookupMap = new Map();
  for (const rule of rules) {
    map.set(rule.Name, {
      id: rule.ID,
      name: rule.Name,
      category: rule.Category,
      severity: rule.Severity,
      description: rule.Description || '',
      hasFixExpression: Boolean(rule.FixExpression),
    });
  }
  return map;
}

// ─── Object Reference Parsing ────────────────────────────────────────

export function parseObjectReference(objectRef: string): ObjectReference {
  const trimmed = objectRef.trim();

  // Extract table name (text between single quotes)
  const tableMatch = trimmed.match(/'([^']+)'/);
  const tableName = tableMatch ? tableMatch[1] : '';

  // Extract object name (text between square brackets)
  const bracketMatch = trimmed.match(/\[([^\]]+)\]/);
  const objectName = bracketMatch ? bracketMatch[1] : '';

  // Extract object type: leading word(s) before the first ' or [
  const typeMatch = trimmed.match(/^([A-Za-z][A-Za-z ]*?)(?:\s*'|\s*\[)/);
  let objectType = typeMatch ? typeMatch[1].trim() : '';

  // Handle parenthesized type like "'DateTableTemplate' (Calculated Table)"
  if (!objectType) {
    const parenMatch = trimmed.match(/\(([^)]+)\)/);
    if (parenMatch) {
      objectType = parenMatch[1].trim();
    }
  }

  // Fallback: if no type extracted, use the full reference as type
  if (!objectType) {
    objectType = trimmed;
  }

  // Build affected object string
  let affectedObject: string;
  if (tableName && objectName) {
    affectedObject = `'${tableName}'[${objectName}]`;
  } else if (tableName) {
    affectedObject = `'${tableName}'`;
  } else if (objectName) {
    affectedObject = `[${objectName}]`;
  } else {
    affectedObject = trimmed;
  }

  return { objectType, tableName, objectName, affectedObject };
}

// ─── Console Output Parsing ──────────────────────────────────────────

export function parseConsoleOutput(stdout: string, ruleLookup: RuleLookupMap): ParsedFinding[] {
  const findings: ParsedFinding[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(VIOLATION_REGEX);
    if (!match) continue;

    const objectRef = match[1];
    const ruleName = match[2];
    const ruleInfo = ruleLookup.get(ruleName);
    if (!ruleInfo) continue;

    const { objectType, affectedObject } = parseObjectReference(objectRef);

    findings.push({
      ruleId: ruleInfo.id,
      ruleName: ruleInfo.name,
      category: ruleInfo.category,
      severity: ruleInfo.severity,
      description: ruleInfo.description,
      affectedObject,
      objectType,
      hasAutoFix: ruleInfo.hasFixExpression,
    });
  }

  return findings;
}

// ─── Path Validation ─────────────────────────────────────────────────

export async function validateTabularEditorPath(): Promise<string> {
  const tePath = process.env[TABULAR_EDITOR_PATH_ENV];
  if (!tePath) {
    throw Object.assign(
      new Error(`${TABULAR_EDITOR_PATH_ENV} environment variable is not configured`),
      { statusCode: 422 },
    );
  }

  try {
    await access(tePath, constants.X_OK);
  } catch {
    throw Object.assign(
      new Error(`Tabular Editor executable not found at: ${tePath}`),
      { statusCode: 422 },
    );
  }

  return tePath;
}

// ─── Process Execution ───────────────────────────────────────────────

export interface TabularEditorResult {
  stdout: string;
  stderr: string;
}

export function runTabularEditor(
  serverAddress: string,
  databaseName: string,
  rulesFilePath: string,
): Promise<TabularEditorResult> {
  return new Promise(async (resolve, reject) => {
    let tePath: string;
    try {
      tePath = await validateTabularEditorPath();
    } catch (err) {
      return reject(err);
    }

    const timeout = parseInt(process.env[TABULAR_EDITOR_TIMEOUT_ENV] || '', 10) || DEFAULT_TIMEOUT;
    const args = [serverAddress, databaseName, '-A', rulesFilePath];

    execFile(tePath, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        if ('killed' in error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
          return reject(new Error(`Tabular Editor analysis timed out after ${timeout / 1000} seconds`));
        }
        if (error.message?.includes('ENOENT')) {
          return reject(Object.assign(
            new Error(`Tabular Editor executable not found at: ${tePath}`),
            { statusCode: 422 },
          ));
        }
        // TE2 returns exit code 1 when BPA violations are found — this is
        // expected behaviour, not an error. Only reject when there is no
        // stdout (i.e. TE failed to produce any output at all).
        if (stdout) {
          return resolve({ stdout, stderr: stderr || '' });
        }
        return reject(new Error(`Tabular Editor analysis failed: ${stderr || error.message}`));
      }
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

// ─── Main Entry Point ────────────────────────────────────────────────

export async function evaluateRulesWithTabularEditor(
  serverAddress: string,
  databaseName: string,
  rules: Array<{ ID: string; Name: string; Category: string; Severity: number; Description: string; FixExpression?: string }>,
  log: ReturnType<typeof childLogger>,
): Promise<ParsedFinding[]> {
  log.info({ serverAddress, databaseName }, 'Starting Tabular Editor BPA analysis');

  const ruleLookup = buildRuleLookupMap(rules);
  log.info({ ruleCount: ruleLookup.size }, 'Rule lookup map built');

  const { stdout, stderr } = await runTabularEditor(serverAddress, databaseName, BPA_RULES_PATH);
  if (stderr) {
    log.warn({ stderr: stderr.substring(0, 500) }, 'Tabular Editor stderr output');
  }

  const findings = parseConsoleOutput(stdout, ruleLookup);
  log.info({ findingCount: findings.length }, 'Tabular Editor analysis complete');

  return findings;
}

// ─── Fix Script Generation ───────────────────────────────────────────

const OBJECT_TYPE_TO_COLLECTION: Record<string, string> = {
  // Rule-scope names (from BPA rule definitions)
  DataColumn: 'Columns',
  CalculatedColumn: 'Columns',
  CalculatedTableColumn: 'Columns',
  Measure: 'Measures',
  Hierarchy: 'Hierarchies',
  Partition: 'Partitions',
  KPI: 'Measures',
  CalculationItem: 'Measures',
  // TE2 BPA output names (from actual TE2 CLI output)
  Column: 'Columns',
  Import: 'Partitions',       // TE2 reports partition type as "Import"
};

/**
 * Generate a TE2 C# script that applies a FixExpression to a specific object.
 *
 * Returns the script content as a string, or throws if the object type is not
 * supported for automated fix.
 */
export function generateFixScript(
  objectType: string,
  affectedObject: string,
  fixExpression: string,
): string {
  const { tableName, objectName } = parseObjectReference(affectedObject);

  // Normalise the FixExpression: replace BPA's `it.` context variable with `obj.`
  const normalisedExpr = fixExpression.replace(/\bit\./g, 'obj.');

  // Table-level objects (Table, Calculated Table)
  if (objectType === 'Table' || objectType === 'Calculated Table' || objectType === 'CalculatedTable') {
    if (!tableName) {
      throw Object.assign(new Error(`Cannot resolve table name from affected object: ${affectedObject}`), { statusCode: 422 });
    }
    const objExpr = `var obj = Model.Tables["${escapeCSharpString(tableName)}"];`;
    return buildScript(objExpr, normalisedExpr);
  }

  // Model-level roles
  if (objectType === 'ModelRole') {
    const roleName = objectName || tableName || affectedObject.replace(/['\[\]]/g, '').trim();
    const objExpr = `var obj = Model.Roles["${escapeCSharpString(roleName)}"];`;
    return buildScript(objExpr, normalisedExpr);
  }

  // Column / Measure / Hierarchy / Partition-level objects
  const collection = OBJECT_TYPE_TO_COLLECTION[objectType];
  if (collection) {
    if (!tableName || !objectName) {
      throw Object.assign(
        new Error(`Cannot resolve table/object name from affected object: ${affectedObject} (type: ${objectType})`),
        { statusCode: 422 },
      );
    }
    const objExpr = `var obj = Model.Tables["${escapeCSharpString(tableName)}"].${collection}["${escapeCSharpString(objectName)}"];`;
    return buildScript(objExpr, normalisedExpr);
  }

  throw Object.assign(
    new Error(`Automated TE fix is not supported for object type: ${objectType}`),
    { statusCode: 422 },
  );
}

function buildScript(objDeclaration: string, fixExpression: string): string {
  const stmt = `obj.${fixExpression}`;
  return `${objDeclaration}\n${stmt};\n`;
}

function escapeCSharpString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Fix Execution ───────────────────────────────────────────────────

export async function runTabularEditorScript(
  serverAddress: string,
  databaseName: string,
  scriptContent: string,
): Promise<TabularEditorResult> {
  const tePath = await validateTabularEditorPath();
  const timeout = parseInt(process.env[TABULAR_EDITOR_TIMEOUT_ENV] || '', 10) || DEFAULT_TIMEOUT;

  // Write script to a temp file
  const scriptPath = join(tmpdir(), `te-fix-${randomUUID()}.cs`);
  await writeFile(scriptPath, scriptContent, 'utf-8');

  try {
    return await new Promise<TabularEditorResult>((resolve, reject) => {
      // Connect, run script, then save back to source with -D (no args)
      const args = [serverAddress, databaseName, '-S', scriptPath, '-D'];

      execFile(tePath, args, { timeout }, (error, stdout, stderr) => {
        if (error) {
          if ('killed' in error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            return reject(new Error(`Tabular Editor script timed out after ${timeout / 1000} seconds`));
          }
          // TE2 may return exit code 1 even on script success (similar to analysis mode).
          // If there's no stderr indicating a real failure, treat it as success.
          if (!stderr) {
            return resolve({ stdout: stdout || '', stderr: '' });
          }
          return reject(new Error(`Tabular Editor script failed (exit ${(error as any).code}): ${stderr}`));
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      });
    });
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
