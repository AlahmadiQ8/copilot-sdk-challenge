import type { FindingSummary } from '../types/api';

interface SummaryBarProps {
  summary: FindingSummary | null;
  loading?: boolean;
}

export default function SummaryBar({ summary, loading }: SummaryBarProps) {
  if (loading) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 flex-1 animate-pulse rounded-lg bg-slate-700/50"
          />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const badges = [
    {
      label: 'Errors',
      count: summary.errorCount,
      color: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: '✕',
    },
    {
      label: 'Warnings',
      count: summary.warningCount,
      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      icon: '⚠',
    },
    {
      label: 'Info',
      count: summary.infoCount,
      color: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      icon: 'ℹ',
    },
    {
      label: 'Fixed',
      count: summary.fixedCount,
      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: '✓',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="region" aria-label="Analysis summary">
      {badges.map((badge) => (
        <div
          key={badge.label}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${badge.color}`}
        >
          <span className="text-lg" aria-hidden="true">
            {badge.icon}
          </span>
          <div>
            <div className="text-2xl font-bold tabular-nums leading-tight">{badge.count}</div>
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">
              {badge.label}
            </div>
          </div>
        </div>
      ))}
        <div className="flex items-center justify-center rounded-lg border border-slate-600/30 bg-slate-700/20 px-4 py-3 text-slate-400">
        <div className="text-center">
          <div className="text-2xl font-bold tabular-nums leading-tight">{summary.totalCount}</div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Total</div>
        </div>
      </div>
    </div>
  );
}
