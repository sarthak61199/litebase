import { useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useResultStore } from '../stores/resultStore';
import type { QueryResult } from '../stores/resultStore';

const ROW_HEIGHT = 36;
const COL_MIN_WIDTH = 120;

type Fields = QueryResult['fields'];

const TableRow = memo(function TableRow({
  row,
  fields,
  transform,
}: {
  row: unknown[];
  fields: Fields;
  transform: string;
}) {
  return (
    <div
      className="absolute top-0 left-0 flex border-b border-gray-800 hover:bg-gray-800/40"
      style={{ transform, height: ROW_HEIGHT, minWidth: '100%' }}
    >
      {fields.map((field, i) => (
        <div
          key={field.name}
          className="shrink-0 flex-1 px-3 flex items-center text-sm font-mono truncate"
          style={{ minWidth: COL_MIN_WIDTH }}
        >
          {row[i] == null ? (
            <span className="text-gray-500 italic">NULL</span>
          ) : (
            <span className="text-gray-300">{String(row[i])}</span>
          )}
        </div>
      ))}
    </div>
  );
});

export function ResultsTable() {
  const phase = useResultStore((s) => s.phase);
  const result = useResultStore((s) => s.result);
  const error = useResultStore((s) => s.error);

  const parentRef = useRef<HTMLDivElement>(null);

  const rows = result?.rows ?? [];
  const fields = result?.fields ?? [];

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (phase === 'running') {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Running…
      </div>
    );
  }

  if (phase === 'cancelling') {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Cancelling…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-mono text-sm">
        <span className="text-red-400 font-semibold">Error: </span>
        <span className="text-red-300">{error.message}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Run a query to see results
      </div>
    );
  }

  // DML/DDL — no SELECT fields
  if (fields.length === 0) {
    const affected = result.affectedRows;
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        {affected != null && affected > 0
          ? `${affected} row${affected !== 1 ? 's' : ''} affected`
          : 'Query OK'}
      </div>
    );
  }

  // SELECT with no rows
  if (rows.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <ColumnHeaders fields={fields} />
        <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
          No rows returned
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {result.capped && (
        <div className="px-3 py-1.5 bg-amber-900/30 border-b border-amber-700/40 text-amber-400 text-xs shrink-0">
          Showing first {rows.length.toLocaleString()} of {result.totalRows.toLocaleString()} rows — row cap applied
        </div>
      )}
      <ColumnHeaders fields={fields} />
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <TableRow
              key={virtualRow.index}
              row={rows[virtualRow.index]}
              fields={fields}
              transform={`translateY(${virtualRow.start}px)`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColumnHeaders({ fields }: { fields: Fields }) {
  return (
    <div className="flex border-b border-gray-700 bg-gray-900 shrink-0">
      {fields.map((field) => (
        <div
          key={field.name}
          className="shrink-0 flex-1 px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide truncate"
          style={{ minWidth: COL_MIN_WIDTH }}
        >
          {field.name}
        </div>
      ))}
    </div>
  );
}
