import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../../src/stores/engineStore';
import { useEditorStore } from '../../src/stores/editorStore';
import { useResultStore } from '../../src/stores/resultStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import type { QueryResult } from '../../src/stores/resultStore';

const MOCK_RESULT: QueryResult = {
  fields: [{ name: 'id', dataTypeID: 23 }],
  rows: [[1]],
  totalRows: 1,
  capped: false,
};

beforeEach(() => {
  useEngineStore.setState({ status: 'booting', engineError: null });
  useEditorStore.setState({ sql: '' });
  useResultStore.setState({
    phase: 'idle',
    runId: null,
    result: null,
    error: null,
    durationMs: null,
  });
  useSettingsStore.setState({ timeoutMs: 10000 });
});

// ---------------------------------------------------------------------------
// engineStore
// ---------------------------------------------------------------------------

describe('useEngineStore', () => {
  it('has correct initial state', () => {
    const s = useEngineStore.getState();
    expect(s.status).toBe('booting');
    expect(s.engineError).toBeNull();
  });

  it('setBooting sets status and clears engineError', () => {
    useEngineStore.setState({ status: 'crashed', engineError: new Error('x') });
    useEngineStore.getState().setBooting();
    const s = useEngineStore.getState();
    expect(s.status).toBe('booting');
    expect(s.engineError).toBeNull();
  });

  it('setReady sets status and clears engineError', () => {
    useEngineStore.setState({ engineError: new Error('x') });
    useEngineStore.getState().setReady();
    const s = useEngineStore.getState();
    expect(s.status).toBe('ready');
    expect(s.engineError).toBeNull();
  });

  it('setRestarting sets status and clears engineError', () => {
    useEngineStore.setState({ engineError: new Error('x') });
    useEngineStore.getState().setRestarting();
    const s = useEngineStore.getState();
    expect(s.status).toBe('restarting');
    expect(s.engineError).toBeNull();
  });

  it('setCrashed sets status and records the error', () => {
    const err = new Error('boom');
    useEngineStore.getState().setCrashed(err);
    const s = useEngineStore.getState();
    expect(s.status).toBe('crashed');
    expect(s.engineError).toBe(err);
  });
});

// ---------------------------------------------------------------------------
// editorStore
// ---------------------------------------------------------------------------

describe('useEditorStore', () => {
  it('has correct initial state', () => {
    expect(useEditorStore.getState().sql).toBe('');
  });

  it('setSql updates sql', () => {
    useEditorStore.getState().setSql('SELECT 1');
    expect(useEditorStore.getState().sql).toBe('SELECT 1');
  });

  it('setSql replaces previous value', () => {
    useEditorStore.getState().setSql('SELECT 1');
    useEditorStore.getState().setSql('SELECT 2');
    expect(useEditorStore.getState().sql).toBe('SELECT 2');
  });
});

// ---------------------------------------------------------------------------
// resultStore
// ---------------------------------------------------------------------------

describe('useResultStore', () => {
  it('has correct initial state', () => {
    const s = useResultStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.runId).toBeNull();
    expect(s.result).toBeNull();
    expect(s.error).toBeNull();
    expect(s.durationMs).toBeNull();
  });

  it('beginRun transitions to running and sets runId', () => {
    useResultStore.getState().beginRun('run-1');
    const s = useResultStore.getState();
    expect(s.phase).toBe('running');
    expect(s.runId).toBe('run-1');
    expect(s.result).toBeNull();
    expect(s.error).toBeNull();
    expect(s.durationMs).toBeNull();
  });

  it('beginRun clears previous result', () => {
    useResultStore.setState({ phase: 'idle', result: MOCK_RESULT, error: null, durationMs: 100, runId: 'old' });
    useResultStore.getState().beginRun('run-2');
    const s = useResultStore.getState();
    expect(s.result).toBeNull();
    expect(s.durationMs).toBeNull();
    expect(s.runId).toBe('run-2');
  });

  it('succeed from running transitions to idle with result', () => {
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().succeed(MOCK_RESULT, 42);
    const s = useResultStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.result).toBe(MOCK_RESULT);
    expect(s.error).toBeNull();
    expect(s.durationMs).toBe(42);
  });

  it('succeed from cancelling transitions to idle', () => {
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().cancelling();
    useResultStore.getState().succeed(MOCK_RESULT, 10);
    expect(useResultStore.getState().phase).toBe('idle');
  });

  it('succeed when idle is a no-op', () => {
    useResultStore.getState().succeed(MOCK_RESULT, 42);
    const s = useResultStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.result).toBeNull();
  });

  it('fail from running transitions to idle with error', () => {
    const err = new Error('query failed');
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().fail(err, 99);
    const s = useResultStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.error).toBe(err);
    expect(s.result).toBeNull();
    expect(s.durationMs).toBe(99);
  });

  it('fail from cancelling transitions to idle', () => {
    const err = new Error('cancelled');
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().cancelling();
    useResultStore.getState().fail(err, 5);
    expect(useResultStore.getState().phase).toBe('idle');
    expect(useResultStore.getState().error).toBe(err);
  });

  it('fail when idle is a no-op', () => {
    const err = new Error('should not apply');
    useResultStore.getState().fail(err, 0);
    expect(useResultStore.getState().phase).toBe('idle');
    expect(useResultStore.getState().error).toBeNull();
  });

  it('cancelling from running transitions to cancelling', () => {
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().cancelling();
    expect(useResultStore.getState().phase).toBe('cancelling');
  });

  it('cancelling when idle is a no-op', () => {
    useResultStore.getState().cancelling();
    expect(useResultStore.getState().phase).toBe('idle');
  });

  it('reset returns to initial state', () => {
    useResultStore.getState().beginRun('run-1');
    useResultStore.getState().succeed(MOCK_RESULT, 50);
    useResultStore.getState().reset();
    const s = useResultStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.runId).toBeNull();
    expect(s.result).toBeNull();
    expect(s.error).toBeNull();
    expect(s.durationMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// settingsStore
// ---------------------------------------------------------------------------

describe('useSettingsStore', () => {
  it('has default timeoutMs of 10000', () => {
    expect(useSettingsStore.getState().timeoutMs).toBe(10000);
  });

  it('setTimeoutMs updates the value', () => {
    useSettingsStore.getState().setTimeoutMs(5000);
    expect(useSettingsStore.getState().timeoutMs).toBe(5000);
  });

  it('setTimeoutMs can be called multiple times', () => {
    useSettingsStore.getState().setTimeoutMs(1000);
    useSettingsStore.getState().setTimeoutMs(30000);
    expect(useSettingsStore.getState().timeoutMs).toBe(30000);
  });
});
