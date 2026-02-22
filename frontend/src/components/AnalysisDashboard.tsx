import { useMemo } from 'react';
import type { Finding, FindingSummary } from '../types/api';

interface AnalysisDashboardProps {
  summary: FindingSummary;
  findings: Finding[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

function calculateHealthScore(summary: FindingSummary): number {
  if (summary.totalCount === 0) return 100;
  const errorRatio = summary.errorCount / summary.totalCount;
  const warningRatio = summary.warningCount / summary.totalCount;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - errorRatio * 2 - warningRatio * 0.5))));
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#34d399';
  if (score >= 80) return '#a3e635';
  if (score >= 65) return '#facc15';
  if (score >= 50) return '#fb923c';
  return '#f87171';
}

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export default function AnalysisDashboard({
  summary,
  findings,
  selectedCategory,
  onCategoryChange,
}: AnalysisDashboardProps) {
  const score = calculateHealthScore(summary);
  const color = getScoreColor(score);
  const grade = getGrade(score);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; errors: number; warnings: number; infos: number }>();
    for (const f of findings) {
      const stats = map.get(f.category) || { count: 0, errors: 0, warnings: 0, infos: 0 };
      stats.count++;
      if (f.severity === 3) stats.errors++;
      else if (f.severity === 2) stats.warnings++;
      else stats.infos++;
      map.set(f.category, stats);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [findings]);

  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - score / 100);

  const total = summary.totalCount || 1;
  const errorPct = (summary.errorCount / total) * 100;
  const warningPct = (summary.warningCount / total) * 100;
  const infoPct = (summary.infoCount / total) * 100;

  return (
    <div className="space-y-4">
      {/* Score + Severity */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Health score */}
        <div className="flex items-center gap-4 rounded-xl border border-slate-700/40 bg-gradient-to-br from-slate-800/80 to-slate-800/40 p-5">
          <div className="relative shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100" className="drop-shadow-lg">
              <circle cx="50" cy="50" r={R} fill="none" stroke="#1e293b" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth="7"
                strokeDasharray={C}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold leading-none" style={{ color }}>
                {score}
              </span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                score
              </span>
            </div>
          </div>
          <div>
            <span className="text-4xl font-black leading-none" style={{ color }}>
              {grade}
            </span>
            <p className="mt-1.5 text-[11px] leading-tight text-slate-500">
              {summary.totalCount.toLocaleString()} finding{summary.totalCount !== 1 ? 's' : ''}
              {summary.fixedCount > 0 && (
                <>
                  <br />
                  <span className="text-emerald-400">{summary.fixedCount} fixed</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-5">
          <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Severity Distribution
          </h3>

          {/* Stacked bar */}
          <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-700/40">
            {errorPct > 0 && (
              <div
                className="bg-red-500 transition-all duration-700 ease-out"
                style={{ width: `${errorPct}%` }}
                title={`${summary.errorCount} errors (${Math.round(errorPct)}%)`}
              />
            )}
            {warningPct > 0 && (
              <div
                className="bg-amber-500 transition-all duration-700 ease-out"
                style={{ width: `${warningPct}%` }}
                title={`${summary.warningCount} warnings (${Math.round(warningPct)}%)`}
              />
            )}
            {infoPct > 0 && (
              <div
                className="bg-sky-400 transition-all duration-700 ease-out"
                style={{ width: `${infoPct}%` }}
                title={`${summary.infoCount} info (${Math.round(infoPct)}%)`}
              />
            )}
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: 'Errors', count: summary.errorCount, dot: 'bg-red-500', text: 'text-red-400' },
              { label: 'Warnings', count: summary.warningCount, dot: 'bg-amber-500', text: 'text-amber-400' },
              { label: 'Info', count: summary.infoCount, dot: 'bg-sky-400', text: 'text-sky-400' },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-sm ${s.dot}`} />
                  <span className={`text-lg font-bold tabular-nums ${s.text}`}>
                    {s.count.toLocaleString()}
                  </span>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category navigation */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
        <button
          role="tab"
          aria-selected={selectedCategory === ''}
          onClick={() => onCategoryChange('')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            selectedCategory === ''
              ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
              : 'border border-slate-700/50 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          }`}
        >
          All
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              selectedCategory === '' ? 'bg-white/20' : 'bg-slate-700/80'
            }`}
          >
            {summary.totalCount.toLocaleString()}
          </span>
        </button>

        {categoryBreakdown.map(([cat, stats]) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(isActive ? '' : cat)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                  : 'border border-slate-700/50 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {cat}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20' : 'bg-slate-700/80'
                }`}
              >
                {stats.count}
              </span>
              {stats.errors > 0 && !isActive && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-red-400"
                  title={`${stats.errors} errors`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
