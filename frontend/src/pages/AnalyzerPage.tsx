import { useState, useCallback } from 'react';
import type { ConnectionStatus, Finding, FindingSummary, AnalysisRun, RunComparison } from '../types/api';
import * as api from '../services/api';
import ConnectionPanel from '../components/ConnectionPanel';
import SummaryBar from '../components/SummaryBar';
import FindingsFilter from '../components/FindingsFilter';
import FindingsGroupedList from '../components/FindingsGroupedList';
import SessionInspector from '../components/SessionInspector';

interface AnalyzerPageProps {
  connection: ConnectionStatus;
  onConnectionChange: (status: ConnectionStatus) => void;
}

export default function AnalyzerPage({ connection, onConnectionChange }: AnalyzerPageProps) {
  const [currentRun, setCurrentRun] = useState<AnalysisRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingSummary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [inspectingFindingId, setInspectingFindingId] = useState<string | null>(null);

  // Filters
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [fixStatus, setFixStatus] = useState('');
  const [sortBy, setSortBy] = useState('severity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchFindings = useCallback(
    async (
      runId: string,
      filters: {
        severity?: string;
        category?: string;
        fixStatus?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
      },
    ) => {
      setLoadingFindings(true);
      try {
        const result = await api.getFindings(runId, {
          severity: filters.severity ? Number(filters.severity) : undefined,
          category: filters.category || undefined,
          fixStatus: filters.fixStatus || undefined,
          sortBy: filters.sortBy || 'severity',
          sortOrder: filters.sortOrder || 'desc',
          limit: 100,
        });
        setFindings(result.findings);
        setSummary(result.summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load findings');
      } finally {
        setLoadingFindings(false);
      }
    },
    [],
  );

  const handleRunAnalysis = async () => {
    const previousRunId = currentRun?.id;
    setAnalyzing(true);
    setError('');
    setFindings([]);
    setSummary(null);
    setComparison(null);
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
        await fetchFindings(runId, { severity, category, fixStatus, sortBy, sortOrder });

        // If this is a rerun, fetch comparison
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

  const handleFilterChange = (
    newSeverity: string,
    newCategory: string,
    newFixStatus: string,
    newSortBy: string,
    newSortOrder: 'asc' | 'desc',
  ) => {
    if (currentRun && currentRun.status === 'COMPLETED') {
      fetchFindings(currentRun.id, {
        severity: newSeverity,
        category: newCategory,
        fixStatus: newFixStatus,
        sortBy: newSortBy,
        sortOrder: newSortOrder,
      });
    }
  };

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
              <span className="text-emerald-400 font-medium">{comparison.resolvedCount}</span>
              <span className="text-slate-400">Resolved</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-red-400 font-medium">{comparison.newCount}</span>
              <span className="text-slate-400">New</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-amber-400 font-medium">{comparison.recurringCount}</span>
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

      {/* Summary */}
      <SummaryBar summary={summary} loading={analyzing} />

      {/* Filters + Findings */}
      {summary && (
        <>
          <FindingsFilter
            severity={severity}
            category={category}
            fixStatus={fixStatus}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSeverityChange={(v) => {
              setSeverity(v);
              handleFilterChange(v, category, fixStatus, sortBy, sortOrder);
            }}
            onCategoryChange={(v) => {
              setCategory(v);
              handleFilterChange(severity, v, fixStatus, sortBy, sortOrder);
            }}
            onFixStatusChange={(v) => {
              setFixStatus(v);
              handleFilterChange(severity, category, v, sortBy, sortOrder);
            }}
            onSortByChange={(v) => {
              setSortBy(v);
              handleFilterChange(severity, category, fixStatus, v, sortOrder);
            }}
            onSortOrderChange={(v) => {
              setSortOrder(v);
              handleFilterChange(severity, category, fixStatus, sortBy, v);
            }}
          />

          {loadingFindings ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-800/40" />
                ))}
              </div>
            ) : findings.length > 0 ? (
              <FindingsGroupedList
                findings={findings}
                onFixTriggered={() => {
                  setTimeout(() => {
                    if (currentRun) fetchFindings(currentRun.id, { severity, category, fixStatus, sortBy, sortOrder });
                  }, 2000);
                }}
                onInspectSession={(findingId) => setInspectingFindingId(findingId)}
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

      {/* Session Inspector Panel */}
      {inspectingFindingId && (
        <SessionInspector
          findingId={inspectingFindingId}
          onClose={() => setInspectingFindingId(null)}
        />
      )}
    </div>
  );
}
