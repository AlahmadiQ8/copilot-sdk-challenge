import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../middleware/logger.js';
import type { BpaRuleResponse } from '../types/api.js';

interface RawBpaRule {
  ID: string;
  Name: string;
  Category: string;
  Description: string;
  Severity: number;
  Scope: string;
  Expression: string;
  FixExpression?: string;
  CompatibilityLevel?: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BPA_RULES_PATH = join(__dirname, '..', 'data', 'bpa-rules.json');

let cachedRules: RawBpaRule[] | null = null;

export async function fetchBpaRules(): Promise<RawBpaRule[]> {
  if (cachedRules) return cachedRules;

  logger.info({ path: BPA_RULES_PATH }, 'Loading BPA rules from local file');
  const raw = readFileSync(BPA_RULES_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const rules: RawBpaRule[] = Array.isArray(data) ? data : data.Rules ?? data.rules ?? [];

  cachedRules = rules;
  logger.info({ count: rules.length }, 'BPA rules loaded');
  return rules;
}

export async function getRulesForApi(category?: string): Promise<BpaRuleResponse[]> {
  const raw = await fetchBpaRules();
  let filtered = raw;
  if (category) {
    filtered = raw.filter((r) => r.Category === category);
  }
  return filtered.map((r) => ({
    id: r.ID,
    name: r.Name,
    category: r.Category,
    description: r.Description,
    severity: r.Severity,
    scope: r.Scope,
    hasFixExpression: !!r.FixExpression,
  }));
}

export async function getRawRules(): Promise<RawBpaRule[]> {
  return fetchBpaRules();
}

export function clearRulesCache(): void {
  cachedRules = null;
}
