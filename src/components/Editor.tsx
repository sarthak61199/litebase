import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { useEditorStore } from "../stores/editorStore";
import type { RunController } from "../hooks/useRunController";

interface EditorProps {
  controller: RunController;
}

const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#569cd6" },
  { tag: tags.operator, color: "#569cd6" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: tags.name, color: "#9cdcfe" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.null, color: "#569cd6" },
  { tag: tags.bool, color: "#569cd6" },
  { tag: tags.punctuation, color: "#d4d4d4" },
]);

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
        lineNumbers(),
        sql({ dialect: PostgreSQL }),
        syntaxHighlighting(sqlHighlightStyle),
        syncToStore,
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": {
            fontFamily: "ui-monospace, monospace",
            fontSize: "14px",
            overflow: "auto",
          },
          ".cm-gutters": {
            backgroundColor: "#171717",
            borderRight: "1px solid #404040",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            color: "#525252",
            fontFamily: "ui-monospace, monospace",
            fontSize: "14px",
            paddingLeft: "12px",
            paddingRight: "8px",
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
