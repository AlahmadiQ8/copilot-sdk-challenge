import type { Finding } from '../types/api';

interface FindingCardProps {
  finding: Finding;
  compact?: boolean;
  onTeFix?: (findingId: string) => void;
  teFixingId?: string | null;
}

const severityConfig: Record<number, { label: string; color: string; bg: string; dot: string }> = {
  3: { label: 'Error', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  2: { label: 'Warning', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  1: { label: 'Info', color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30', dot: 'bg-sky-400' },
};

const fixStatusConfig: Record<string, { label: string; color: string }> = {
  UNFIXED: { label: 'Unfixed', color: 'text-slate-400' },
  IN_PROGRESS: { label: 'Fixing…', color: 'text-amber-400' },
  FIXED: { label: 'Fixed', color: 'text-emerald-400' },
  FAILED: { label: 'Fix Failed', color: 'text-red-400' },
};

const friendlyObjectType: Record<string, string> = {
  DataColumn: 'Column',
  CalculatedColumn: 'Calc Column',
  CalculatedTable: 'Calc Table',
  Measure: 'Measure',
  Table: 'Table',
  Relationship: 'Relationship',
  Model: 'Model',
};

/** Parse `'TableRef'[ObjectName]` into { table, object } or return the raw string as object. */
function parseAffectedObject(raw: string): { object: string; table: string | null } {
  const match = raw.match(/^'([^']+)'\[([^\]]+)\]$/);
  if (match) return { table: match[1], object: match[2] };
  return { object: raw, table: null };
}

export default function FindingCard({ finding, compact, onTeFix, teFixingId }: FindingCardProps) {
  const sev = severityConfig[finding.severity] || severityConfig[1];
  const fix = fixStatusConfig[finding.fixStatus] || fixStatusConfig.UNFIXED;

  if (compact) {
    const { object: objName, table: tableRef } = parseAffectedObject(finding.affectedObject);
    const typeLabel = friendlyObjectType[finding.objectType] || finding.objectType;

    return (
      <div
        className="group flex items-center gap-3 rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 transition hover:border-slate-600/50 hover:bg-slate-800/50"
        role="row"
        aria-label={`${finding.affectedObject} (${finding.objectType})`}
      >
        {/* Severity dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${sev.dot}`} title={sev.label} />

        {/* Object type badge */}
        <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {typeLabel}
        </span>

        {/* Object name + table context */}
        <div className="min-w-0 flex-1">
          <span className="truncate text-xs font-medium text-slate-100">{objName}</span>
          {tableRef && (
            <span className="ml-1.5 text-[11px] text-slate-500">
              in <span className="font-mono text-slate-400">{tableRef}</span>
            </span>
          )}
        </div>

        {/* TE Fix button */}
        {onTeFix && finding.hasAutoFix && finding.fixStatus === 'UNFIXED' && (
          <button
            onClick={(e) => { e.stopPropagation(); onTeFix(finding.id); }}
            disabled={teFixingId === finding.id}
            className="shrink-0 rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40"
            aria-label={`Apply Tabular Editor fix for ${finding.affectedObject}`}
          >
            {teFixingId === finding.id ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                Fixing…
              </span>
            ) : (
              'Auto Fix'
            )}
          </button>
        )}
        {finding.fixStatus === 'IN_PROGRESS' && teFixingId === finding.id && (
          <span className="shrink-0 text-[10px] font-medium text-amber-400">Applying…</span>
        )}
        <span className={`shrink-0 text-xs font-medium ${fix.color}`}>{fix.label}</span>
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
        </div>
      </div>

      <h3 className="mb-1 text-sm font-medium text-slate-100">{finding.ruleName}</h3>
      <p className="mb-2 text-xs leading-relaxed text-slate-400">{finding.description}</p>

      {(() => {
        const { object: fullObjName, table: fullTableRef } = parseAffectedObject(finding.affectedObject);
        const fullTypeLabel = friendlyObjectType[finding.objectType] || finding.objectType;
        return (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {fullTypeLabel}
            </span>
            <span className="font-medium text-slate-300">{fullObjName}</span>
            {fullTableRef && (
              <>
                <span className="text-slate-600">·</span>
                <span>in <span className="font-mono text-slate-400">{fullTableRef}</span></span>
              </>
            )}
          </div>
        );
      })()}
    </article>
  );
}
