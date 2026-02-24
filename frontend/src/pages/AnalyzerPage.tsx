import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ConnectionStatus, Finding, FindingSummary, AnalysisRun, RunComparison } from '../types/api';
import * as api from '../services/api';
import ConnectionPanel from '../components/ConnectionPanel';
import AnalysisDashboard from '../components/AnalysisDashboard';
import FindingsFilter from '../components/FindingsFilter';
import FindingsGroupedList from '../components/FindingsGroupedList';
import BulkSessionInspector from '../components/BulkSessionInspector';
import ChatFixPanel from '../components/ChatFixPanel';

interface AnalyzerPageProps {
  connection: ConnectionStatus;
  onConnectionChange: (status: ConnectionStatus) => void;
}

export default function AnalyzerPage({ connection, onConnectionChange }: AnalyzerPageProps) {
  const [currentRun, setCurrentRun] = useState<AnalysisRun | null>(null);
  const [allFindings, setAllFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingSummary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [inspectingBulkRuleId, setInspectingBulkRuleId] = useState<string | null>(null);
  const [bulkFixingRuleId, setBulkFixingRuleId] = useState<string | null>(null);
  const [teFixingId, setTeFixingId] = useState<string | null>(null);
  const [bulkTeFixingRuleId, setBulkTeFixingRuleId] = useState<string | null>(null);
  const [chatFixRuleId, setChatFixRuleId] = useState<string | null>(null);
  const [activeChatRuleIds, setActiveChatRuleIds] = useState<Set<string>>(new Set());

  // Client-side filters
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [fixStatus, setFixStatus] = useState('');
  const [sortBy, setSortBy] = useState('severity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Client-side filtering + sorting (no server round-trip)
  const filteredFindings = useMemo(() => {
    let result = allFindings;
    if (severity) result = result.filter((f) => f.severity === Number(severity));
    if (category) result = result.filter((f) => f.category === category);
    if (fixStatus) result = result.filter((f) => f.fixStatus === fixStatus);

    return [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'severity':
          cmp = a.severity - b.severity;
          break;
        case 'category':
          cmp = a.category.localeCompare(b.category);
          break;
        case 'ruleName':
          cmp = a.ruleName.localeCompare(b.ruleName);
          break;
        case 'affectedObject':
          cmp = a.affectedObject.localeCompare(b.affectedObject);
          break;
        default:
          cmp = a.severity - b.severity;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [allFindings, severity, category, fixStatus, sortBy, sortOrder]);

  const fetchAllFindings = useCallback(async (runId: string) => {
    try {
      const result = await api.getFindings(runId, { limit: 5000 });
      setAllFindings(result.findings);
      setSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load findings');
    }
  }, []);

  const handleRunAnalysis = async () => {
    const previousRunId = currentRun?.id;
    setAnalyzing(true);
    setError('');
    setAllFindings([]);
    setSummary(null);
    setComparison(null);
    setCategory('');
    setSeverity('');
    setFixStatus('');
    try {
      const { runId } = await api.runAnalysis();

      // Poll for completion
      let run: AnalysisRun | null = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        run = await api.getAnalysisRun(runId);
        setCurrentRun(run);
        if (run.status !== 'RUNNING') break;
      }

      if (run && run.status === 'COMPLETED') {
        await fetchAllFindings(runId);

        if (previousRunId) {
          try {
            const comp = await api.compareAnalysisRuns(runId, previousRunId);
            setComparison(comp);
          } catch {
            // Comparison is non-critical
          }
        }
      } else if (run && run.status === 'FAILED') {
        setError('Analysis failed. Check the backend logs for details.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBulkFix = async (ruleId: string) => {
    if (!currentRun) return;
    setBulkFixingRuleId(ruleId);
    setInspectingBulkRuleId(ruleId);
    setError('');
    try {
      await api.triggerBulkFix(ruleId, currentRun.id);
      setAllFindings((prev) =>
        prev.map((f) =>
          f.ruleId === ruleId && f.fixStatus === 'UNFIXED'
            ? { ...f, fixStatus: 'IN_PROGRESS' as const }
            : f,
        ),
      );
      const pollInterval = setInterval(async () => {
        if (!currentRun) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const result = await api.getFindings(currentRun.id, { limit: 5000 });
          setAllFindings(result.findings);
          setSummary(result.summary);
          const ruleFindings = result.findings.filter((f) => f.ruleId === ruleId);
          const stillInProgress = ruleFindings.some((f) => f.fixStatus === 'IN_PROGRESS');
          if (!stillInProgress) {
            clearInterval(pollInterval);
            setBulkFixingRuleId(null);
          }
        } catch {
          clearInterval(pollInterval);
          setBulkFixingRuleId(null);
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk fix failed');
      setBulkFixingRuleId(null);
    }
  };

  const handleTeFix = async (findingId: string) => {
    setTeFixingId(findingId);
    setError('');
    try {
      const result = await api.applyTeFix(findingId);
      setAllFindings((prev) =>
        prev.map((f) =>
          f.id === findingId
            ? { ...f, fixStatus: result.status as 'FIXED', fixSummary: result.fixSummary }
            : f,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TE fix failed');
      // Refresh finding status from server
      if (currentRun) {
        try {
          const result = await api.getFindings(currentRun.id, { limit: 5000 });
          setAllFindings(result.findings);
          setSummary(result.summary);
        } catch { /* ignore refresh error */ }
      }
    } finally {
      setTeFixingId(null);
    }
  };

  const handleBulkTeFix = async (ruleId: string) => {
    if (!currentRun) return;
    setBulkTeFixingRuleId(ruleId);
    setError('');
    // Optimistically mark unfixed findings as IN_PROGRESS
    setAllFindings((prev) =>
      prev.map((f) =>
        f.ruleId === ruleId && f.fixStatus === 'UNFIXED' && f.hasAutoFix
          ? { ...f, fixStatus: 'IN_PROGRESS' as const }
          : f,
      ),
    );
    try {
      await api.applyBulkTeFix(ruleId, currentRun.id);
      // Refresh all findings from server to get accurate status
      const result = await api.getFindings(currentRun.id, { limit: 5000 });
      setAllFindings(result.findings);
      setSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk TE fix failed');
      // Refresh findings to see actual status
      if (currentRun) {
        try {
          const result = await api.getFindings(currentRun.id, { limit: 5000 });
          setAllFindings(result.findings);
          setSummary(result.summary);
        } catch { /* ignore refresh error */ }
      }
    } finally {
      setBulkTeFixingRuleId(null);
    }
  };

  const hasActiveFilters = !!(severity || category || fixStatus);

  // Fetch active chat sessions to show "Resume Chat" buttons
  useEffect(() => {
    if (!currentRun) return;
    let cancelled = false;
    api.getActiveChatFixSessions(currentRun.id).then((sessions) => {
      if (!cancelled) {
        setActiveChatRuleIds(new Set(sessions.map((s) => s.ruleId)));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentRun?.id]);

  const handleChatFix = (ruleId: string) => {
    setChatFixRuleId(ruleId);
  };

  // Get the rule name for the chat panel header
  const chatFixRuleName = useMemo(() => {
    if (!chatFixRuleId) return undefined;
    return allFindings.find((f) => f.ruleId === chatFixRuleId)?.ruleName;
  }, [chatFixRuleId, allFindings]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-6 2xl:max-w-[1800px] 2xl:px-8">
      {/* Connection */}
      <ConnectionPanel onConnectionChange={onConnectionChange} />

      {/* Run Analysis */}
      {connection.connected && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-40"
            aria-label={analyzing ? 'Analysis in progress' : undefined}
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Analyzing…
              </span>
            ) : currentRun ? (
              'Rerun Analysis'
            ) : (
              'Run Analysis'
            )}
          </button>
          {currentRun && (
            <span className="text-xs text-slate-500">
              Run: {currentRun.id.slice(0, 8)}… · Status:{' '}
              <span
                className={
                  currentRun.status === 'COMPLETED'
                    ? 'text-emerald-400'
                    : currentRun.status === 'FAILED'
                      ? 'text-red-400'
                      : 'text-amber-400'
                }
              >
                {currentRun.status}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Comparison Banner */}
      {comparison && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Comparison with Previous Run</h3>
          <div className="flex gap-6 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="font-medium text-emerald-400">{comparison.resolvedCount}</span>
              <span className="text-slate-400">Resolved</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="font-medium text-red-400">{comparison.newCount}</span>
              <span className="text-slate-400">New</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="font-medium text-amber-400">{comparison.recurringCount}</span>
              <span className="text-slate-400">Recurring</span>
            </span>
          </div>
          {comparison.resolvedCount > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-emerald-400 hover:text-emerald-300">
                Show {comparison.resolvedCount} resolved finding{comparison.resolvedCount > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {comparison.resolved.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{item.ruleName}</span>
                    <span className="font-mono text-slate-500">{item.affectedObject}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {analyzing && !summary && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="h-[140px] animate-pulse rounded-xl bg-slate-800/40" />
            <div className="h-[140px] animate-pulse rounded-xl bg-slate-800/40" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-28 animate-pulse rounded-lg bg-slate-800/40" />
            ))}
          </div>
        </div>
      )}

      {/* Dashboard */}
      {summary && (
        <AnalysisDashboard
          summary={summary}
          findings={allFindings}
          selectedCategory={category}
          onCategoryChange={setCategory}
        />
      )}

      {/* Filters + Findings */}
      {summary && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FindingsFilter
              severity={severity}
              fixStatus={fixStatus}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSeverityChange={setSeverity}
              onFixStatusChange={setFixStatus}
              onSortByChange={setSortBy}
              onSortOrderChange={setSortOrder}
            />
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSeverity('');
                  setCategory('');
                  setFixStatus('');
                }}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs tabular-nums text-slate-500">
              {filteredFindings.length === allFindings.length
                ? `${allFindings.length.toLocaleString()} findings`
                : `${filteredFindings.length.toLocaleString()} of ${allFindings.length.toLocaleString()}`}
            </span>
          </div>

          {filteredFindings.length > 0 ? (
            <FindingsGroupedList
              key={currentRun?.id}
              findings={filteredFindings}
              onBulkFixTriggered={handleBulkFix}
              onInspectBulkSession={(ruleId) => setInspectingBulkRuleId(ruleId)}
              bulkFixingRuleId={bulkFixingRuleId}
              defaultCollapsed
              onTeFix={handleTeFix}
              teFixingId={teFixingId}
              onBulkTeFix={handleBulkTeFix}
              bulkTeFixingRuleId={bulkTeFixingRuleId}
              onChatFix={handleChatFix}
              activeChatRuleIds={activeChatRuleIds}
            />
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">
              No findings match the current filters.
            </p>
          )}
        </>
      )}

      {/* Empty state */}
      {!summary && !analyzing && connection.connected && (
        <div className="py-20 text-center">
          <p className="text-lg text-slate-500">
            Run analysis to check your model against best-practice rules.
          </p>
        </div>
      )}

      {/* Bulk Session Inspector Panel */}
      {inspectingBulkRuleId && currentRun && (
        <BulkSessionInspector
          ruleId={inspectingBulkRuleId}
          analysisRunId={currentRun.id}
          onClose={() => setInspectingBulkRuleId(null)}
        />
      )}

      {/* Chat Fix Panel */}
      {chatFixRuleId && currentRun && (
        <ChatFixPanel
          ruleId={chatFixRuleId}
          analysisRunId={currentRun.id}
          ruleName={chatFixRuleName}
          onClose={() => {
            setChatFixRuleId(null);
            // Refresh findings after chat session
            fetchAllFindings(currentRun.id);
            // Refresh active chat sessions
            api.getActiveChatFixSessions(currentRun.id).then((sessions) => {
              setActiveChatRuleIds(new Set(sessions.map((s) => s.ruleId)));
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
