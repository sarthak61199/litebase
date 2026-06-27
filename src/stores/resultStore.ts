import { create } from 'zustand';
import type { DbResponses } from '../db/rpc/protocol';

type Phase = 'idle' | 'running' | 'cancelling';

export type QueryResult = DbResponses['query'];

interface ResultState {
  phase: Phase;
  runId: string | null;
  result: QueryResult | null;
  error: Error | null;
  durationMs: number | null;
  beginRun: (runId: string) => void;
  succeed: (result: QueryResult, durationMs: number) => void;
  fail: (error: Error, durationMs: number) => void;
  cancelling: () => void;
  reset: () => void;
}

export const useResultStore = create<ResultState>()((set, get) => ({
  phase: 'idle',
  runId: null,
  result: null,
  error: null,
  durationMs: null,

  beginRun: (runId) => {
    set({ phase: 'running', runId, result: null, error: null, durationMs: null });
  },

  succeed: (result, durationMs) => {
    if (get().phase !== 'running' && get().phase !== 'cancelling') return;
    set({ phase: 'idle', result, error: null, durationMs });
  },

  fail: (error, durationMs) => {
    if (get().phase !== 'running' && get().phase !== 'cancelling') return;
    set({ phase: 'idle', error, result: null, durationMs });
  },

  cancelling: () => {
    if (get().phase !== 'running') return;
    set({ phase: 'cancelling' });
  },

  reset: () => {
    set({ phase: 'idle', runId: null, result: null, error: null, durationMs: null });
  },
}));
