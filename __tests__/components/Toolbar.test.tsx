import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from '../../src/components/Toolbar';
import { useEngineStore } from '../../src/stores/engineStore';
import { useResultStore } from '../../src/stores/resultStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import type { RunController } from '../../src/hooks/useRunController';
import type { QueryResult } from '../../src/stores/resultStore';

function makeController(): RunController {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  };
}

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    fields: [{ name: 'id', dataTypeID: 23 }],
    rows: [[1], [2], [3]],
    totalRows: 3,
    capped: false,
    ...overrides,
  };
}

beforeEach(() => {
  useEngineStore.setState({ status: 'ready', engineError: null });
  useResultStore.setState({ phase: 'idle', runId: null, result: null, error: null, durationMs: null });
  useSettingsStore.setState({ timeoutMs: 10000 });
});

describe('Toolbar — Run button', () => {
  it('is enabled when phase is idle and engine is ready', () => {
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).not.toBeDisabled();
  });

  it('is disabled when phase is running', () => {
    useResultStore.setState({ phase: 'running', runId: 'r1', result: null, error: null, durationMs: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('is disabled when phase is cancelling', () => {
    useResultStore.setState({ phase: 'cancelling', runId: 'r1', result: null, error: null, durationMs: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('is disabled when engine is restarting', () => {
    useEngineStore.setState({ status: 'restarting', engineError: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('is disabled when engine is booting', () => {
    useEngineStore.setState({ status: 'booting', engineError: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('is disabled when engine is crashed', () => {
    useEngineStore.setState({ status: 'crashed', engineError: new Error('crash') });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('calls controller.run() when clicked', () => {
    const controller = makeController();
    render(<Toolbar controller={controller} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    expect(controller.run).toHaveBeenCalledOnce();
  });
});

describe('Toolbar — Cancel button', () => {
  it('is disabled when phase is idle', () => {
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('is enabled when phase is running', () => {
    useResultStore.setState({ phase: 'running', runId: 'r1', result: null, error: null, durationMs: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
  });

  it('is enabled when phase is cancelling', () => {
    useResultStore.setState({ phase: 'cancelling', runId: 'r1', result: null, error: null, durationMs: null });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
  });

  it('calls controller.cancel() when clicked', () => {
    useResultStore.setState({ phase: 'running', runId: 'r1', result: null, error: null, durationMs: null });
    const controller = makeController();
    render(<Toolbar controller={controller} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(controller.cancel).toHaveBeenCalledOnce();
  });
});

describe('Toolbar — timeout input', () => {
  it('renders the current timeoutMs value', () => {
    useSettingsStore.setState({ timeoutMs: 5000 });
    render(<Toolbar controller={makeController()} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(5000);
  });

  it('updates useSettingsStore when a valid value is entered', () => {
    render(<Toolbar controller={makeController()} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '3000' } });
    expect(useSettingsStore.getState().timeoutMs).toBe(3000);
  });

  it('does not update the store for negative values', () => {
    render(<Toolbar controller={makeController()} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '-1' } });
    expect(useSettingsStore.getState().timeoutMs).toBe(10000);
  });
});

describe('Toolbar — timing and row count', () => {
  it('does not render timing or row count when no result', () => {
    render(<Toolbar controller={makeController()} />);
    expect(screen.queryByText(/^\d+ms$/)).toBeNull();
    expect(screen.queryByText(/row/)).toBeNull();
  });

  it('renders duration in ms when durationMs < 1000', () => {
    useResultStore.setState({ phase: 'idle', runId: 'r1', result: makeResult(), error: null, durationMs: 42 });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText('42ms')).toBeTruthy();
  });

  it('renders duration in seconds when durationMs >= 1000', () => {
    useResultStore.setState({ phase: 'idle', runId: 'r1', result: makeResult(), error: null, durationMs: 1500 });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText('1.50s')).toBeTruthy();
  });

  it('renders row count after a result', () => {
    useResultStore.setState({ phase: 'idle', runId: 'r1', result: makeResult(), error: null, durationMs: 10 });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText(/3 rows/)).toBeTruthy();
  });

  it('renders singular "row" for a single-row result', () => {
    const result = makeResult({ rows: [[1]], totalRows: 1 });
    useResultStore.setState({ phase: 'idle', runId: 'r1', result, error: null, durationMs: 10 });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText(/1 row$/)).toBeTruthy();
  });

  it('renders "N / M rows" when result is capped', () => {
    const result = makeResult({ rows: Array(10000).fill([1]), totalRows: 25000, capped: true });
    useResultStore.setState({ phase: 'idle', runId: 'r1', result, error: null, durationMs: 200 });
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText(/10,000 \/ 25,000 rows/)).toBeTruthy();
  });
});

describe('Toolbar — engine status badge', () => {
  it.each([
    ['booting', 'Booting'],
    ['ready', 'Ready'],
    ['restarting', 'Restarting'],
    ['crashed', 'Crashed'],
  ] as const)('renders "%s" label for engine status %s', (status, label) => {
    if (status === 'crashed') {
      useEngineStore.setState({ status, engineError: new Error('x') });
    } else {
      useEngineStore.setState({ status, engineError: null });
    }
    render(<Toolbar controller={makeController()} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
