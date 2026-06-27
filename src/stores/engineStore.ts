import { create } from 'zustand';

type EngineStatus = 'booting' | 'ready' | 'restarting' | 'crashed';

interface EngineState {
  status: EngineStatus;
  engineError: Error | null;
  setBooting: () => void;
  setReady: () => void;
  setRestarting: () => void;
  setCrashed: (error: Error) => void;
}

export const useEngineStore = create<EngineState>()((set) => ({
  status: 'booting',
  engineError: null,
  setBooting: () => set({ status: 'booting', engineError: null }),
  setReady: () => set({ status: 'ready', engineError: null }),
  setRestarting: () => set({ status: 'restarting', engineError: null }),
  setCrashed: (error) => set({ status: 'crashed', engineError: error }),
}));
