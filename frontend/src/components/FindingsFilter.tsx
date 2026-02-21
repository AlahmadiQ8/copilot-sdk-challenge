import type { FindingCategory, FixStatus } from '../types/api';

interface FindingsFilterProps {
  severity: string;
  category: string;
  fixStatus: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSeverityChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onFixStatusChange: (val: string) => void;
  onSortByChange: (val: string) => void;
  onSortOrderChange: (val: 'asc' | 'desc') => void;
}

const categories: FindingCategory[] = [
  'Performance',
  'DAX Expressions',
  'Error Prevention',
  'Maintenance',
  'Naming Conventions',
  'Formatting',
];

const fixStatuses: { value: FixStatus; label: string }[] = [
  { value: 'UNFIXED', label: 'Unfixed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'FAILED', label: 'Failed' },
];

const sortOptions = [
  { value: 'severity', label: 'Severity' },
  { value: 'category', label: 'Category' },
  { value: 'ruleName', label: 'Rule Name' },
  { value: 'affectedObject', label: 'Object' },
];

export default function FindingsFilter({
  severity,
  category,
  fixStatus,
  sortBy,
  sortOrder,
  onSeverityChange,
  onCategoryChange,
  onFixStatusChange,
  onSortByChange,
  onSortOrderChange,
}: FindingsFilterProps) {
  const selectClass =
    'rounded-lg border border-slate-600 bg-slate-700/80 px-3 py-1.5 text-xs text-slate-200 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500';

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Filter findings"
    >
      <select
        value={severity}
        onChange={(e) => onSeverityChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by severity"
      >
        <option value="">All Severities</option>
        <option value="3">Error (3)</option>
        <option value="2">Warning (2)</option>
        <option value="1">Info (1)</option>
      </select>

      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by category"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={fixStatus}
        onChange={(e) => onFixStatusChange(e.target.value)}
        className={selectClass}
        aria-label="Filter by fix status"
      >
        <option value="">All Statuses</option>
        {fixStatuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="mx-1 h-5 w-px bg-slate-600/50" aria-hidden="true" />

      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value)}
        className={selectClass}
        aria-label="Sort by"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            Sort: {opt.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
        className="rounded-lg border border-slate-600 bg-slate-700/80 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
        aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
        title={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
      >
        {sortOrder === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
