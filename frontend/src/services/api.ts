import type {
  PbiInstance,
  ConnectionStatus,
  AnalysisRun,
  FindingsListResponse,
  Finding,
  BpaRule,
  RunComparison,
  DaxQueryResult,
  DaxQueryHistoryItem,
  ChatFixSession,
  ChatFixActiveSession,
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Connection ──

export async function listInstances(): Promise<{ instances: PbiInstance[] }> {
  return request('/connection/instances');
}

export async function connect(
  serverAddress: string,
  databaseName: string,
): Promise<ConnectionStatus> {
  return request('/connection/connect', {
    method: 'POST',
    body: JSON.stringify({ serverAddress, databaseName }),
  });
}

export async function disconnect(): Promise<{ success: boolean }> {
  return request('/connection/disconnect', { method: 'POST' });
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  return request('/connection/status');
}

export async function checkConnectionHealth(): Promise<{ healthy: boolean }> {
  return request('/connection/health');
}

// ── Analysis ──

export async function runAnalysis(): Promise<{ runId: string }> {
  return request('/analysis/run', { method: 'POST' });
}

export async function getAnalysisRuns(
  limit = 20,
  offset = 0,
): Promise<{ runs: AnalysisRun[]; total: number }> {
  return request(`/analysis/runs?limit=${limit}&offset=${offset}`);
}

export async function getAnalysisRun(runId: string): Promise<AnalysisRun> {
  return request(`/analysis/runs/${encodeURIComponent(runId)}`);
}

export async function compareAnalysisRuns(
  currentRunId: string,
  previousRunId: string,
): Promise<RunComparison> {
  return request(
    `/analysis/runs/${encodeURIComponent(currentRunId)}/compare/${encodeURIComponent(previousRunId)}`,
  );
}

// ── Findings ──

export async function getFindings(
  runId: string,
  params: {
    severity?: number;
    category?: string;
    fixStatus?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  } = {},
): Promise<FindingsListResponse> {
  const query = new URLSearchParams();
  if (params.severity) query.set('severity', String(params.severity));
  if (params.category) query.set('category', params.category);
  if (params.fixStatus) query.set('fixStatus', params.fixStatus);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return request(`/analysis/runs/${encodeURIComponent(runId)}/findings${qs ? `?${qs}` : ''}`);
}

export async function getFinding(findingId: string): Promise<Finding> {
  return request(`/findings/${encodeURIComponent(findingId)}`);
}

// ── Rules ──

export async function getRules(category?: string): Promise<BpaRule[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return request(`/rules${qs}`);
}

// ── Tabular Editor Fix ──

export async function applyTeFix(
  findingId: string,
): Promise<{ findingId: string; status: string; fixSummary: string }> {
  return request(`/findings/${encodeURIComponent(findingId)}/te-fix`, { method: 'POST' });
}

export async function applyBulkTeFix(
  ruleId: string,
  analysisRunId: string,
): Promise<{ ruleId: string; fixedCount: number; skippedCount: number; failedCount: number; status: string }> {
  return request(`/rules/${encodeURIComponent(ruleId)}/te-fix-all`, {
    method: 'POST',
    body: JSON.stringify({ analysisRunId }),
  });
}

// ── DAX ──

export async function executeDax(query: string): Promise<DaxQueryResult> {
  return request('/dax/execute', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function generateDax(
  prompt: string,
): Promise<{ queryId: string; query: string; explanation: string }> {
  return request('/dax/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function getDaxHistory(
  limit = 20,
  offset = 0,
): Promise<{ queries: DaxQueryHistoryItem[]; total: number }> {
  return request(`/dax/history?limit=${limit}&offset=${offset}`);
}

export async function cancelDaxQuery(queryId: string): Promise<{ success: boolean }> {
  return request(`/dax/${encodeURIComponent(queryId)}/cancel`, { method: 'POST' });
}

// ── Chat Fix ──

export async function createOrResumeChatFixSession(
  ruleId: string,
  analysisRunId: string,
): Promise<ChatFixSession> {
  return request('/chat-fix/sessions', {
    method: 'POST',
    body: JSON.stringify({ ruleId, analysisRunId }),
  });
}

export async function getActiveChatFixSessions(
  analysisRunId: string,
): Promise<ChatFixActiveSession[]> {
  return request(`/chat-fix/sessions/active?analysisRunId=${encodeURIComponent(analysisRunId)}`);
}

export async function sendChatFixMessage(
  sessionId: string,
  content: string,
): Promise<{ ok: boolean }> {
  return request(`/chat-fix/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function approveChatFixTool(
  sessionId: string,
  proposalId: string,
): Promise<{ ok: boolean; approved: boolean }> {
  return request(`/chat-fix/sessions/${encodeURIComponent(sessionId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ proposalId }),
  });
}

export async function rejectChatFixTool(
  sessionId: string,
  proposalId: string,
  reason?: string,
): Promise<{ ok: boolean; approved: boolean }> {
  return request(`/chat-fix/sessions/${encodeURIComponent(sessionId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ proposalId, reason }),
  });
}

export async function restartChatFixSession(
  sessionId: string,
): Promise<ChatFixSession> {
  return request(`/chat-fix/sessions/${encodeURIComponent(sessionId)}/restart`, {
    method: 'POST',
  });
}

export async function closeChatFixSession(
  sessionId: string,
): Promise<{ ok: boolean }> {
  return request(`/chat-fix/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export function createChatFixSSEUrl(sessionId: string): string {
  return `${API_BASE}/chat-fix/sessions/${encodeURIComponent(sessionId)}/stream`;
}
