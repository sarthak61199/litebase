import { lazy, Suspense, useEffect } from 'react';
import { DBClient } from './db/client';
import { WorkerRpc } from './db/rpc/client';
import { bindClientToStores } from './db/bindings';
import { useRunController } from './hooks/useRunController';
import { useEngineStore } from './stores/engineStore';
import { ResultsTable } from './components/ResultsTable';
import { Toolbar } from './components/Toolbar';

const Editor = lazy(() =>
  import('./components/Editor').then((m) => ({ default: m.Editor })),
);

const rpc = new WorkerRpc(
  () => new Worker(new URL('./db/worker.ts', import.meta.url), { type: 'module' }),
);
const client = new DBClient(rpc);
bindClientToStores(client);

export function App() {
  const engineStatus = useEngineStore((s) => s.status);
  const hadRestart = useEngineStore((s) => s.hadRestart);
  const controller = useRunController(client);

  useEffect(() => {
    void client.boot();
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950 text-gray-100 antialiased">
      <Toolbar controller={controller} />

      {(engineStatus === 'restarting' || hadRestart) && (
        <div
          role="alert"
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-950/50 border-b border-amber-800/40 text-amber-300 text-xs"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="shrink-0 opacity-80">
            <path d="M7 1L13.06 11.5H.94L7 1zm0 2.18L2.64 10.5h8.72L7 3.18zM6.5 6h1v2.5h-1V6zm0 3h1v1h-1V9z" />
          </svg>
          Force-stop triggered — the in-memory database has been wiped. All tables have been cleared.
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0">
        {/* Editor panel */}
        <div className="h-[38%] min-h-0 p-2 pb-0">
          <Suspense fallback={<div className="h-full rounded bg-gray-900" />}>
            <Editor controller={controller} />
          </Suspense>
        </div>

        {/* Divider */}
        <div className="shrink-0 h-2 flex items-center justify-center cursor-row-resize select-none group">
          <div className="flex gap-[3px]">
            <span className="block w-6 h-px bg-gray-700 group-hover:bg-gray-500 transition-colors" />
            <span className="block w-6 h-px bg-gray-700 group-hover:bg-gray-500 transition-colors" />
            <span className="block w-6 h-px bg-gray-700 group-hover:bg-gray-500 transition-colors" />
          </div>
        </div>

        {/* Results panel */}
        <div className="flex-1 min-h-0 border-t border-gray-800/60">
          <ResultsTable />
        </div>
      </div>
    </div>
  );
}
