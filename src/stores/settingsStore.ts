import { create } from 'zustand';

interface SettingsState {
  timeoutMs: number;
  setTimeoutMs: (timeoutMs: number) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  timeoutMs: 10000,
  setTimeoutMs: (timeoutMs) => set({ timeoutMs }),
}));
