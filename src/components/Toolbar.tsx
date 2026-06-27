import type { RunController } from '../hooks/useRunController';
import { useEngineStore } from '../stores/engineStore';
import { useResultStore } from '../stores/resultStore';
import { useSettingsStore } from '../stores/settingsStore';

const STATUS_LABEL: Record<string, string> = {
  booting: 'Booting',
  ready: 'Ready',
  restarting: 'Restarting',
  crashed: 'Crashed',
};

const STATUS_DOT: Record<string, string> = {
  booting: 'bg-yellow-400 animate-pulse',
  ready: 'bg-green-400',
  restarting: 'bg-orange-400 animate-pulse',
  crashed: 'bg-red-500',
};

export function Toolbar({ controller }: { controller: RunController }) {
  const engineStatus = useEngineStore((s) => s.status);
  const phase = useResultStore((s) => s.phase);
  const result = useResultStore((s) => s.result);
  const durationMs = useResultStore((s) => s.durationMs);
  const timeoutMs = useSettingsStore((s) => s.timeoutMs);
  const setTimeoutMs = useSettingsStore((s) => s.setTimeoutMs);

  const isRunDisabled = phase !== 'idle' || engineStatus === 'restarting' || engineStatus === 'booting' || engineStatus === 'crashed';
  const isCancelEnabled = phase === 'running' || phase === 'cancelling';

  const rowCount = result?.rows?.length ?? null;
  const totalRows = result?.totalRows ?? null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
      {/* Run */}
      <button
        onClick={() => void controller.run()}
        disabled={isRunDisabled}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
          bg-blue-600 text-white hover:bg-blue-500
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
      >
        <RunIcon />
        Run
      </button>

      {/* Cancel */}
      <button
        onClick={() => controller.cancel()}
        disabled={!isCancelEnabled}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
          bg-gray-700 text-gray-200 hover:bg-gray-600
          disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700"
      >
        <CancelIcon />
        Cancel
      </button>

      {/* Timeout */}
      <label className="flex items-center gap-2 text-sm text-gray-400">
        <span>Timeout</span>
        <input
          type="number"
          min={0}
          step={500}
          value={timeoutMs}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0) setTimeoutMs(v);
          }}
          className="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 text-sm text-right
            focus:outline-none focus:border-blue-500"
        />
        <span>ms</span>
      </label>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Timing + row count */}
      {durationMs != null && (
        <span className="text-xs text-gray-500 font-mono">
          {durationMs < 1000
            ? `${durationMs}ms`
            : `${(durationMs / 1000).toFixed(2)}s`}
        </span>
      )}

      {rowCount != null && (
        <span className="text-xs text-gray-400 font-mono">
          {rowCount.toLocaleString()}
          {totalRows != null && totalRows > rowCount
            ? ` / ${totalRows.toLocaleString()} rows`
            : ` row${rowCount !== 1 ? 's' : ''}`}
        </span>
      )}

      {/* Engine status badge */}
      <div className="flex items-center gap-1.5 pl-3 border-l border-gray-800">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[engineStatus] ?? 'bg-gray-500'}`} />
        <span className="text-xs text-gray-400">{STATUS_LABEL[engineStatus] ?? engineStatus}</span>
      </div>
    </div>
  );
}

function RunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M2 1.5l8 4.5-8 4.5V1.5z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="2" width="8" height="8" rx="1" />
    </svg>
  );
}
