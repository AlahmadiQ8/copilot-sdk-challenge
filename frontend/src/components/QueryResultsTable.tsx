interface QueryResultsTableProps {
  columns: Array<{ name: string; dataType: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
}

export default function QueryResultsTable({
  columns,
  rows,
  rowCount,
  executionTimeMs,
}: QueryResultsTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span>{rowCount} row{rowCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{executionTimeMs}ms</span>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-700/50">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-700/50 bg-slate-800/60">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="whitespace-nowrap px-3 py-2 font-semibold text-slate-300"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-800/30 transition hover:bg-slate-800/30"
              >
                {columns.map((col) => (
                  <td key={col.name} className="whitespace-nowrap px-3 py-1.5 text-slate-400">
                    {formatCell(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="px-3 py-4 text-center text-slate-500"
                >
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
