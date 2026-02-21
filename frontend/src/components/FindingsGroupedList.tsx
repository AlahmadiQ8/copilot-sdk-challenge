import { useState, useMemo } from 'react';
import type { Finding } from '../types/api';
import FindingCard from './FindingCard';

interface FindingsGroupedListProps {
  findings: Finding[];
  onFixTriggered: (findingId: string) => void;
  onInspectSession: (findingId: string) => void;
}

interface RuleGroup {
  ruleId: string;
  ruleName: string;
  severity: number;
  category: string;
  description: string;
  findings: Finding[];
}

const severityConfig: Record<number, { label: string; color: string; bg: string; border: string }> = {
  3: { label: 'Error', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' },
  2: { label: 'Warning', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  1: { label: 'Info', color: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/30' },
};

export default function FindingsGroupedList({
  findings,
  onFixTriggered,
  onInspectSession,
}: FindingsGroupedListProps) {
  const groups = useMemo(() => {
    const map = new Map<string, RuleGroup>();
    for (const f of findings) {
      let group = map.get(f.ruleId);
      if (!group) {
        group = {
          ruleId: f.ruleId,
          ruleName: f.ruleName,
          severity: f.severity,
          category: f.category,
          description: f.description,
          findings: [],
        };
        map.set(f.ruleId, group);
      }
      group.findings.push(f);
    }
    return Array.from(map.values());
  }, [findings]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (ruleId: string) => {
    setCollapsed((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    for (const g of groups) all[g.ruleId] = true;
    setCollapsed(all);
  };

  const expandAll = () => setCollapsed({});

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.ruleId]);

  return (
    <div className="space-y-3" role="list" aria-label="Analysis findings grouped by rule">
      {/* Collapse/Expand all toggle */}
      {groups.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="rounded-md border border-slate-600 bg-slate-700/60 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
            aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
          >
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      )}

      {groups.map((group) => {
        const isCollapsed = !!collapsed[group.ruleId];
        const sev = severityConfig[group.severity] || severityConfig[1];
        const unfixedCount = group.findings.filter((f) => f.fixStatus === 'UNFIXED').length;
        const fixedCount = group.findings.filter((f) => f.fixStatus === 'FIXED').length;

        return (
          <div
            key={group.ruleId}
            role="listitem"
            className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden"
          >
            {/* Group header */}
            <button
              onClick={() => toggle(group.ruleId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-700/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400/50"
              aria-expanded={!isCollapsed}
              aria-controls={`rule-group-${group.ruleId}`}
            >
              {/* Chevron */}
              <svg
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>

              {/* Severity badge */}
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${sev.bg} ${sev.border}`}
              >
                {sev.label}
              </span>

              {/* Rule name */}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                {group.ruleName}
              </span>

              {/* Category badge */}
              <span className="hidden rounded-md bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400 sm:inline-flex">
                {group.category}
              </span>

              {/* Object count */}
              <span className="rounded-full bg-slate-700/70 px-2.5 py-0.5 text-xs tabular-nums text-slate-300">
                {group.findings.length} {group.findings.length === 1 ? 'object' : 'objects'}
              </span>

              {/* Fix status summary */}
              {fixedCount > 0 && (
                <span className="text-xs text-emerald-400">
                  {fixedCount} fixed
                </span>
              )}
              {unfixedCount > 0 && unfixedCount < group.findings.length && (
                <span className="text-xs text-slate-500">
                  {unfixedCount} unfixed
                </span>
              )}
            </button>

            {/* Expanded content */}
            {!isCollapsed && (
              <div
                id={`rule-group-${group.ruleId}`}
                className="space-y-2 border-t border-slate-700/40 px-4 py-3"
              >
                <p className="mb-2 text-xs leading-relaxed text-slate-400">
                  {group.description}
                </p>
                {group.findings.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    onFixTriggered={() => onFixTriggered(f.id)}
                    onInspectSession={() => onInspectSession(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
