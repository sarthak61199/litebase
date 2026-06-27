import { useCallback } from 'react';
import type { DBClient } from '../db/client';
import { useEditorStore } from '../stores/editorStore';
import { useSettingsStore } from '../stores/settingsStore';

export interface RunController {
  run: () => Promise<void>;
  cancel: () => void;
}

export function useRunController(client: DBClient): RunController {
  const sql = useEditorStore(s => s.sql);
  const timeoutMs = useSettingsStore(s => s.timeoutMs);

  const run = useCallback(async () => {
    await client.run(sql, { timeoutMs });
  }, [client, sql, timeoutMs]);

  const cancel = useCallback(() => {
    client.cancel();
  }, [client]);

  return { run, cancel };
}
