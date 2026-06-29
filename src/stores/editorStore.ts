import { create } from "zustand";

interface EditorState {
  sql: string;
  setSql: (sql: string) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  sql: "",
  setSql: (sql) => set({ sql }),
}));
