// Frontend API types mirroring backend contracts

// ── Connection ──
export interface PbiInstance {
  name: string;
  serverAddress: string;
  databaseName: string;
}

export interface ConnectRequest {
  serverAddress: string;
  databaseName: string;
}

export interface ConnectionStatus {
  connected: boolean;
  modelName?: string;
  serverAddress?: string;
  databaseName?: string;
  connectedAt?: string;
}

// ── Analysis ──
export interface AnalysisRun {
  id: string;
  modelName: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface FindingSummary {
  totalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  fixedCount: number;
  unfixedCount: number;
}

// ── Finding ──
export type FixStatus = 'UNFIXED' | 'IN_PROGRESS' | 'FIXED' | 'FAILED';
export type Severity = 1 | 2 | 3;
export type FindingCategory =
  | 'Performance'
  | 'DAX Expressions'
  | 'Error Prevention'
  | 'Maintenance'
  | 'Naming Conventions'
  | 'Formatting';

export interface Finding {
  id: string;
  ruleId: string;
  ruleName: string;
  category: string;
  severity: number;
  description: string;
  affectedObject: string;
  objectType: string;
  fixStatus: FixStatus;
  fixSummary: string | null;
  hasAutoFix: boolean;
  createdAt: string;
}

export interface FindingsListResponse {
  findings: Finding[];
  summary: FindingSummary;
  total: number;
}

// ── Run Comparison ──
export interface RunComparisonItem {
  ruleId: string;
  ruleName: string;
  affectedObject: string;
}

export interface RunComparison {
  resolvedCount: number;
  newCount: number;
  recurringCount: number;
  resolved: RunComparisonItem[];
  new: RunComparisonItem[];
}

// ── Fix Session ──
export type FixSessionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type StepEventType = 'reasoning' | 'tool_call' | 'tool_result' | 'message' | 'error';

export interface FixSession {
  id: string;
  findingId: string;
  status: FixSessionStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface FixSessionStep {
  id: string;
  stepNumber: number;
  eventType: StepEventType;
  content: string;
  timestamp: string;
}

export interface FixSessionDetail extends FixSession {
  steps: FixSessionStep[];
}

// ── DAX ──
export interface DaxQueryRequest {
  query: string;
}

export interface DaxGenerateRequest {
  prompt: string;
}

export interface DaxQueryResult {
  id: string;
  query: string;
  status: 'COMPLETED' | 'FAILED';
  columns: Array<{ name: string; dataType: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
  errorMessage: string | null;
}

export interface DaxQueryHistoryItem {
  id: string;
  queryText: string;
  naturalLanguage: string | null;
  status: string;
  rowCount: number | null;
  executionTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// ── Rules ──
export interface BpaRule {
  id: string;
  name: string;
  category: string;
  description: string;
  severity: number;
  scope: string;
  hasFixExpression: boolean;
}

// ── Common ──
export interface ErrorResponse {
  error: string;
  details?: string;
}
