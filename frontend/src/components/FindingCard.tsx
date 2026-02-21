import { useState } from 'react';
import type { Finding } from '../types/api';

interface FindingCardProps {
  finding: Finding;
  compact?: boolean;
  onFixTriggered?: (findingId: string) => void;
  onInspectSession?: (findingId: string) => void;
}

const severityConfig: Record<number, { label: string; color: string; bg: string }> = {
  3: { label: 'Error', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' },
  2: { label: 'Warning', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
  1: { label: 'Info', color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' },
};

const fixStatusConfig: Record<string, { label: string; color: string }> = {
  UNFIXED: { label: 'Unfixed', color: 'text-slate-400' },
  IN_PROGRESS: { label: 'Fixing…', color: 'text-amber-400' },
  FIXED: { label: 'Fixed', color: 'text-emerald-400' },
  FAILED: { label: 'Fix Failed', color: 'text-red-400' },
};

export default function FindingCard({ finding, compact, onFixTriggered, onInspectSession }: FindingCardProps) {
  const [fixing, setFixing] = useState(false);
  const sev = severityConfig[finding.severity] || severityConfig[1];
  const fix = fixStatusConfig[finding.fixStatus] || fixStatusConfig.UNFIXED;

  const handleFix = () => {
    setFixing(true);
    onFixTriggered?.(finding.id);
  };

  if (compact) {
    return (
      <div
        className="group flex items-center gap-3 rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 transition hover:border-slate-600/50 hover:bg-slate-800/50"
        role="row"
        aria-label={`${finding.affectedObject} (${finding.objectType})`}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
          {finding.affectedObject}
        </span>
        <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{finding.objectType}</span>
        <span className={`shrink-0 text-xs font-medium ${fix.color}`}>{fix.label}</span>
        {finding.hasAutoFix && finding.fixStatus === 'UNFIXED' && (
          <button
            onClick={handleFix}
            disabled={fixing}
            className="shrink-0 rounded-md bg-violet-600/80 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-40"
            aria-label={`AI Fix: ${finding.affectedObject}`}
          >
            {fixing ? 'Fixing…' : 'AI Fix'}
          </button>
        )}
        {(finding.fixStatus === 'FIXED' || finding.fixStatus === 'FAILED') && (
          <button
            onClick={() => onInspectSession?.(finding.id)}
            className="shrink-0 rounded-md border border-slate-600 px-2 py-0.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label={`Inspect fix session for ${finding.affectedObject}`}
          >
            Inspect
          </button>
        )}
      </div>
    );
  }

  return (
    <article
      className="group rounded-lg border border-slate-700/50 bg-slate-800/40 p-4 transition hover:border-slate-600/60 hover:bg-slate-800/60 focus-within:ring-2 focus-within:ring-sky-400/50 focus-within:ring-offset-1 focus-within:ring-offset-slate-900"
      aria-label={`${sev.label} finding: ${finding.ruleName} on ${finding.affectedObject}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${sev.bg}`}
          >
            {sev.label}
          </span>
          <span className="rounded-md bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
            {finding.category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${fix.color}`}>{fix.label}</span>
          {finding.hasAutoFix && finding.fixStatus === 'UNFIXED' && (
            <button
              onClick={handleFix}
              disabled={fixing}
              className="rounded-md bg-violet-600/80 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-40"
              aria-label={`AI Fix: ${finding.ruleName}`}
            >
              {fixing ? 'Fixing…' : 'AI Fix'}
            </button>
          )}
          {(finding.fixStatus === 'FIXED' || finding.fixStatus === 'FAILED') && (
            <button
              onClick={() => onInspectSession?.(finding.id)}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
              aria-label={`Inspect fix session for ${finding.ruleName}`}
            >
              Inspect
            </button>
          )}
        </div>
      </div>

      <h3 className="mb-1 text-sm font-medium text-slate-100">{finding.ruleName}</h3>
      <p className="mb-2 text-xs leading-relaxed text-slate-400">{finding.description}</p>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="rounded bg-slate-700/60 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
          {finding.affectedObject}
        </span>
        <span className="text-slate-600">·</span>
        <span>{finding.objectType}</span>
        <span className="text-slate-600">·</span>
        <span className="font-mono text-slate-500">{finding.ruleId}</span>
      </div>
    </article>
  );
}
