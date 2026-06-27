import { describe, it, expect, beforeEach } from 'vitest';
import { bindClientToStores } from '../../src/db/bindings';
import type { DBClient, DbClientEvent } from '../../src/db/client';
import { useEngineStore } from '../../src/stores/engineStore';
import { useResultStore } from '../../src/stores/resultStore';

// Minimal DBClient stand-in — only needs `on` for bindClientToStores.
function makeFakeClient() {
  let listener: ((e: DbClientEvent) => void) | null = null;
  const fake = {
    on(l: (e: DbClientEvent) => void) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit(event: DbClientEvent) {
      listener?.(event);
    },
  };
  return fake;
}

const MOCK_RESULT = {
  fields: [{ name: 'id', dataTypeID: 23 }],
  rows: [[1]],
  totalRows: 1,
  capped: false,
};

const ENGINE_INITIAL = { status: 'booting' as const, engineError: null };
const RESULT_INITIAL = {
  phase: 'idle' as const,
  runId: null,
  result: null,
  error: null,
  durationMs: null,
};

beforeEach(() => {
  useEngineStore.setState(ENGINE_INITIAL);
  useResultStore.setState(RESULT_INITIAL);
});

function engineSnap() {
  const { status, engineError } = useEngineStore.getState();
  return { status, engineError };
}

function resultSnap() {
  const { phase, runId, result, error, durationMs } = useResultStore.getState();
  return { phase, runId, result, error, durationMs };
}

describe('bindClientToStores — engine events', () => {
  it('engine:booting sets engine status to booting and does not touch resultStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    useEngineStore.setState({ status: 'ready', engineError: null });
    const resultBefore = resultSnap();

    client.emit({ type: 'engine:booting' });

    expect(engineSnap()).toEqual({ status: 'booting', engineError: null });
    expect(resultSnap()).toEqual(resultBefore);
  });

  it('engine:ready sets engine status to ready and does not touch resultStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    const resultBefore = resultSnap();

    client.emit({ type: 'engine:ready' });

    expect(engineSnap()).toEqual({ status: 'ready', engineError: null });
    expect(resultSnap()).toEqual(resultBefore);
  });

  it('engine:restarting sets engine status to restarting and does not touch resultStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    const resultBefore = resultSnap();

    client.emit({ type: 'engine:restarting' });

    expect(engineSnap()).toEqual({ status: 'restarting', engineError: null });
    expect(resultSnap()).toEqual(resultBefore);
  });

  it('engine:crashed sets engine status to crashed with error and does not touch resultStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    const err = new Error('worker died');
    const resultBefore = resultSnap();

    client.emit({ type: 'engine:crashed', error: err });

    expect(engineSnap()).toEqual({ status: 'crashed', engineError: err });
    expect(resultSnap()).toEqual(resultBefore);
  });
});

describe('bindClientToStores — run events', () => {
  it('run:begin transitions resultStore to running and does not touch engineStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    useEngineStore.setState({ status: 'ready', engineError: null });
    const engineBefore = engineSnap();

    client.emit({ type: 'run:begin', runId: 'r1' });

    const r = resultSnap();
    expect(r.phase).toBe('running');
    expect(r.runId).toBe('r1');
    expect(r.result).toBeNull();
    expect(r.error).toBeNull();
    expect(r.durationMs).toBeNull();
    expect(engineSnap()).toEqual(engineBefore);
  });

  it('run:succeed transitions resultStore to idle with result and does not touch engineStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    // put resultStore in running so succeed() is not a no-op
    useResultStore.getState().beginRun('r1');
    useEngineStore.setState({ status: 'ready', engineError: null });
    const engineBefore = engineSnap();

    client.emit({ type: 'run:succeed', runId: 'r1', result: MOCK_RESULT, durationMs: 42 });

    const r = resultSnap();
    expect(r.phase).toBe('idle');
    expect(r.result).toBe(MOCK_RESULT);
    expect(r.error).toBeNull();
    expect(r.durationMs).toBe(42);
    expect(engineSnap()).toEqual(engineBefore);
  });

  it('run:fail transitions resultStore to idle with error and does not touch engineStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    useResultStore.getState().beginRun('r1');
    useEngineStore.setState({ status: 'ready', engineError: null });
    const engineBefore = engineSnap();

    const err = new Error('syntax error');
    client.emit({ type: 'run:fail', runId: 'r1', error: err, durationMs: 15 });

    const r = resultSnap();
    expect(r.phase).toBe('idle');
    expect(r.error).toBe(err);
    expect(r.result).toBeNull();
    expect(r.durationMs).toBe(15);
    expect(engineSnap()).toEqual(engineBefore);
  });

  it('run:cancelling transitions resultStore to cancelling and does not touch engineStore', () => {
    const client = makeFakeClient();
    bindClientToStores(client as unknown as DBClient);

    useResultStore.getState().beginRun('r1');
    useEngineStore.setState({ status: 'ready', engineError: null });
    const engineBefore = engineSnap();

    client.emit({ type: 'run:cancelling', runId: 'r1' });

    expect(resultSnap().phase).toBe('cancelling');
    expect(engineSnap()).toEqual(engineBefore);
  });
});

describe('bindClientToStores — unsubscribe', () => {
  it('returned unsubscribe stops all further event routing', () => {
    const client = makeFakeClient();
    const unsub = bindClientToStores(client as unknown as DBClient);

    unsub();

    client.emit({ type: 'engine:ready' });
    client.emit({ type: 'run:begin', runId: 'r1' });

    // Neither event should have mutated the stores.
    expect(engineSnap()).toEqual(ENGINE_INITIAL);
    expect(resultSnap()).toEqual(RESULT_INITIAL);
  });
});
