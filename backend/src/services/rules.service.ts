import { logger } from '../middleware/logger.js';
import type { BpaRuleResponse } from '../types/api.js';

const BPA_RULES_URL =
  'https://raw.githubusercontent.com/microsoft/Analysis-Services/refs/heads/master/BestPracticeRules/BPARules.json';

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

let cachedRules: RawBpaRule[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function fetchBpaRules(): Promise<RawBpaRule[]> {
  const now = Date.now();
  if (cachedRules && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRules;
  }

  logger.info('Fetching BPA rules from GitHub');
  const response = await fetch(BPA_RULES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch BPA rules: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  // The JSON may be an array directly or wrapped in an object
  const rules: RawBpaRule[] = Array.isArray(data) ? data : data.Rules ?? data.rules ?? [];

  cachedRules = rules;
  cacheTimestamp = now;
  logger.info({ count: rules.length }, 'BPA rules cached');
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
  cacheTimestamp = 0;
}
