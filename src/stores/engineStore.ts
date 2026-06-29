import { create } from "zustand";

type EngineStatus = "booting" | "ready" | "restarting" | "crashed";

interface EngineState {
  status: EngineStatus;
  engineError: Error | null;
  hadRestart: boolean;
  setBooting: () => void;
  setReady: () => void;
  setRestarting: () => void;
  setCrashed: (error: Error) => void;
  clearHadRestart: () => void;
}

export const useEngineStore = create<EngineState>()((set) => ({
  status: "booting",
  engineError: null,
  hadRestart: false,
  setBooting: () => set({ status: "booting", engineError: null }),
  setReady: () => set({ status: "ready", engineError: null }),
  setRestarting: () =>
    set({ status: "restarting", engineError: null, hadRestart: true }),
  setCrashed: (error) => set({ status: "crashed", engineError: error }),
  clearHadRestart: () => set({ hadRestart: false }),
}));
