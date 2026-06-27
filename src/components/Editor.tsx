import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { useEditorStore } from "../stores/editorStore";
import type { RunController } from "../hooks/useRunController";

interface EditorProps {
  controller: RunController;
}

export function Editor({ controller }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const setSql = useEditorStore((s) => s.setSql);
  const sql_ = useEditorStore((s) => s.sql);

  useEffect(() => {
    if (!containerRef.current) return;

    const syncToStore = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setSql(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: "",
      extensions: [
        history(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              controllerRef.current.run();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        sql({ dialect: PostgreSQL }),
        syncToStore,
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": {
            fontFamily: "ui-monospace, monospace",
            fontSize: "14px",
            overflow: "auto",
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [setSql]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== sql_) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: sql_ },
      });
    }
  }, [sql_]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded border border-neutral-700 bg-neutral-900"
      data-testid="editor"
    />
  );
}
