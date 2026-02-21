import { useState, useEffect, useCallback } from 'react';
import type { DaxQueryResult, DaxQueryHistoryItem } from '../types/api';
import * as api from '../services/api';
import DaxEditor from '../components/DaxEditor';
import QueryResultsTable from '../components/QueryResultsTable';
import NaturalLanguageInput from '../components/NaturalLanguageInput';

export default function DaxQueryPage() {
  const [query, setQuery] = useState("EVALUATE 'Sales'");
  const [result, setResult] = useState<DaxQueryResult | null>(null);
  const [explanation, setExplanation] = useState('');
  const [executing, setExecuting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<DaxQueryHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getDaxHistory(20, 0);
      setHistory(data.queries);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleExecute = async () => {
    if (!query.trim()) return;
    setExecuting(true);
    setError('');
    setResult(null);
    try {
      const res = await api.executeDax(query);
      setResult(res);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleGenerate = async (prompt: string) => {
    setGenerating(true);
    setError('');
    try {
      const res = await api.generateDax(prompt);
      setQuery(res.query);
      setExplanation(res.explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleHistoryClick = (item: DaxQueryHistoryItem) => {
    setQuery(item.queryText);
    setExplanation('');
    setResult(null);
    setError('');
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6 2xl:max-w-[1800px] 2xl:px-8">
      {/* Main Content */}
      <section className="min-w-0 flex-1 space-y-4" aria-label="DAX query editor">
        {/* Natural Language Input */}
        <NaturalLanguageInput onGenerate={handleGenerate} loading={generating} />

        {/* AI Explanation */}
        {explanation && (
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-300">
            {explanation}
          </div>
        )}

        {/* DAX Editor */}
        <DaxEditor value={query} onChange={setQuery} readOnly={executing} />

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExecute}
            disabled={executing || !query.trim()}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-40"
            aria-label={executing ? 'Query running' : undefined}
          >
            {executing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running…
              </span>
            ) : (
              'Run Query'
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && result.status === 'COMPLETED' && (
          <QueryResultsTable
            columns={result.columns}
            rows={result.rows}
            rowCount={result.rowCount}
            executionTimeMs={result.executionTimeMs}
          />
        )}

        {result && result.status === 'FAILED' && result.errorMessage && (
          <div
            className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400"
            role="alert"
          >
            {result.errorMessage}
          </div>
        )}
      </section>

      {/* History Sidebar */}
      <aside className="w-full shrink-0 lg:w-64 2xl:w-80" aria-label="Query history">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Query History</h3>
        <div className="space-y-1.5">
          {history.length > 0 ? (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => handleHistoryClick(item)}
                className="w-full rounded-md border border-slate-700/30 bg-slate-800/30 p-2 text-left text-xs transition hover:border-slate-600/50 hover:bg-slate-800/50"
              >
                <p className="truncate font-mono text-slate-300">
                  {item.naturalLanguage || item.queryText}
                </p>
                <div className="mt-1 flex items-center gap-2 text-slate-500">
                  <span
                    className={
                      item.status === 'COMPLETED' ? 'text-emerald-400' : 'text-red-400'
                    }
                  >
                    {item.status === 'COMPLETED' ? '✓' : '✕'}
                  </span>
                  {item.rowCount !== null && <span>{item.rowCount} rows</span>}
                  {item.executionTimeMs !== null && <span>{item.executionTimeMs}ms</span>}
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-500">No queries yet</p>
          )}
        </div>
      </aside>
    </div>
  );
}
