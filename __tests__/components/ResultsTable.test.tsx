import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsTable } from '../../src/components/ResultsTable';
import { useResultStore } from '../../src/stores/resultStore';
import type { QueryResult } from '../../src/stores/resultStore';

// jsdom has no layout engine — stub the virtualizer to render items inline.
// Cap at 20 so large-dataset tests (e.g. 10 000-row cap banner) don't time out;
// banner text comes from rows.length, not from rendered virtual items.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const renderCount = Math.min(count, 20);
    return {
      getVirtualItems: () =>
        Array.from({ length: renderCount }, (_, i) => ({
          index: i,
          start: i * estimateSize(),
          key: i,
          size: estimateSize(),
          lane: 0,
          end: (i + 1) * estimateSize(),
        })),
      getTotalSize: () => count * estimateSize(),
    };
  },
}));

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    fields: [
      { name: 'id', dataTypeID: 23 },
      { name: 'name', dataTypeID: 25 },
    ],
    rows: [
      [1, 'alice'],
      [2, 'bob'],
    ],
    totalRows: 2,
    capped: false,
    ...overrides,
  };
}

beforeEach(() => {
  useResultStore.setState({
    phase: 'idle',
    runId: null,
    result: null,
    error: null,
    durationMs: null,
  });
});

describe('ResultsTable — idle / no result', () => {
  it('shows placeholder when no result and phase is idle', () => {
    render(<ResultsTable />);
    expect(screen.getByText(/run a query to see results/i)).toBeTruthy();
  });
});

describe('ResultsTable — running / cancelling', () => {
  it('shows "Running…" while phase is running', () => {
    useResultStore.setState({ phase: 'running', runId: 'r1', result: null, error: null, durationMs: null });
    render(<ResultsTable />);
    expect(screen.getByText(/running/i)).toBeTruthy();
  });

  it('shows "Cancelling…" while phase is cancelling', () => {
    useResultStore.setState({ phase: 'cancelling', runId: 'r1', result: null, error: null, durationMs: null });
    render(<ResultsTable />);
    expect(screen.getByText(/cancelling/i)).toBeTruthy();
  });
});

describe('ResultsTable — error state', () => {
  it('renders the error message', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: null,
      error: new Error('syntax error at or near "SELCT"'),
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/syntax error at or near "SELCT"/)).toBeTruthy();
  });

  it('labels the error prominently', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: null,
      error: new Error('oops'),
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/error/i)).toBeTruthy();
  });
});

describe('ResultsTable — affected rows (INSERT/UPDATE/DDL)', () => {
  it('shows row count when affectedRows > 0', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ fields: [], rows: [], totalRows: 0, affectedRows: 3 }),
      error: null,
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/3 rows affected/i)).toBeTruthy();
  });

  it('uses singular "row" for 1 affected row', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ fields: [], rows: [], totalRows: 0, affectedRows: 1 }),
      error: null,
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/1 row affected/i)).toBeTruthy();
  });

  it('shows "Query OK" when affectedRows is 0', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ fields: [], rows: [], totalRows: 0, affectedRows: 0 }),
      error: null,
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/query ok/i)).toBeTruthy();
  });

  it('shows "Query OK" when affectedRows is undefined (DDL)', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ fields: [], rows: [], totalRows: 0, affectedRows: undefined }),
      error: null,
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/query ok/i)).toBeTruthy();
  });
});

describe('ResultsTable — SELECT with columns', () => {
  it('renders column headers from fields', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult(),
      error: null,
      durationMs: 10,
    });
    render(<ResultsTable />);
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getByText('name')).toBeTruthy();
  });

  it('renders row data', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult(),
      error: null,
      durationMs: 10,
    });
    render(<ResultsTable />);
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('renders NULL cells with a NULL indicator', () => {
    const result = makeResult({
      rows: [[1, null]],
      totalRows: 1,
    });
    useResultStore.setState({ phase: 'idle', runId: 'r1', result, error: null, durationMs: 5 });
    render(<ResultsTable />);
    expect(screen.getByText('NULL')).toBeTruthy();
  });

  it('shows "No rows returned" for an empty SELECT', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ rows: [], totalRows: 0 }),
      error: null,
      durationMs: 5,
    });
    render(<ResultsTable />);
    expect(screen.getByText(/no rows returned/i)).toBeTruthy();
    // Column headers still appear
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getByText('name')).toBeTruthy();
  });
});

describe('ResultsTable — row cap banner', () => {
  it('shows the cap banner when capped is true', () => {
    const result = makeResult({
      rows: Array.from({ length: 10000 }, (_, i) => [i]),
      fields: [{ name: 'n', dataTypeID: 23 }],
      totalRows: 25000,
      capped: true,
    });
    useResultStore.setState({ phase: 'idle', runId: 'r1', result, error: null, durationMs: 200 });
    render(<ResultsTable />);
    expect(screen.getByText(/10,000/)).toBeTruthy();
    expect(screen.getByText(/25,000/)).toBeTruthy();
    expect(screen.getByText(/row cap applied/i)).toBeTruthy();
  });

  it('does not show the cap banner when capped is false', () => {
    useResultStore.setState({
      phase: 'idle',
      runId: 'r1',
      result: makeResult({ capped: false }),
      error: null,
      durationMs: 10,
    });
    render(<ResultsTable />);
    expect(screen.queryByText(/row cap applied/i)).toBeNull();
  });
});
