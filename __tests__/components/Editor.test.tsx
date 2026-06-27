import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Editor } from '../../src/components/Editor';
import { useEditorStore } from '../../src/stores/editorStore';
import type { RunController } from '../../src/hooks/useRunController';

// Hoisted so vi.mock factories can close over these references
const mocks = vi.hoisted(() => ({
  updateListener: null as null | ((update: { docChanged: boolean; state: { doc: { toString(): string } } }) => void),
  runBinding: null as null | { key: string; run: () => boolean },
  // All calls to keymap.of, in call order, with their full binding arrays.
  // Used to assert precedence: run binding must share a call with defaultKeymap's
  // Mod-Enter and appear before it.
  keymapCalls: [] as Array<Array<{ key: string; run: () => boolean }>>,
  viewDestroy: vi.fn(),
  viewDispatch: vi.fn(),
}));

vi.mock('@codemirror/view', () => {
  // Must be a regular function so `new EditorView(...)` works
  function EditorView(this: any) {
    this.destroy = mocks.viewDestroy;
    this.dispatch = mocks.viewDispatch;
    this.state = { doc: { toString: () => '' } };
  }

  EditorView.updateListener = {
    of: (cb: (update: any) => void) => {
      mocks.updateListener = cb;
      return { type: 'updateListener' };
    },
  };

  EditorView.theme = () => ({ type: 'theme' });

  return {
    EditorView,
    keymap: {
      of: (bindings: Array<{ key: string; run: () => boolean }>) => {
        mocks.keymapCalls.push([...bindings]);
        const runBinding = bindings.find((b) => b.key === 'Mod-Enter');
        if (runBinding) mocks.runBinding = runBinding;
        return { type: 'keymap' };
      },
    },
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn(() => ({ doc: { toString: () => '' } })),
  },
}));

// Use real defaultKeymap/historyKeymap so the Mod-Enter conflict is visible.
// Only mock history() since we don't need it to do real work in these tests.
vi.mock('@codemirror/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codemirror/commands')>();
  return {
    defaultKeymap: actual.defaultKeymap,
    historyKeymap: actual.historyKeymap,
    history: vi.fn(() => ({ type: 'history' })),
  };
});

vi.mock('@codemirror/lang-sql', () => ({
  sql: vi.fn(() => ({ type: 'sql' })),
  PostgreSQL: {},
}));

function makeController(): RunController {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  };
}

beforeEach(() => {
  mocks.updateListener = null;
  mocks.runBinding = null;
  mocks.keymapCalls = [];
  mocks.viewDestroy.mockClear();
  mocks.viewDispatch.mockClear();
  useEditorStore.setState({ sql: '' });
});

describe('Editor — rendering', () => {
  it('renders the editor container', () => {
    render(<Editor controller={makeController()} />);
    expect(screen.getByTestId('editor')).toBeTruthy();
  });
});

describe('Editor — value sync to store', () => {
  it('propagates document changes to useEditorStore', () => {
    render(<Editor controller={makeController()} />);

    act(() => {
      mocks.updateListener!({
        docChanged: true,
        state: { doc: { toString: () => 'SELECT 1' } },
      });
    });

    expect(useEditorStore.getState().sql).toBe('SELECT 1');
  });

  it('does not update the store when docChanged is false', () => {
    render(<Editor controller={makeController()} />);

    act(() => {
      mocks.updateListener!({
        docChanged: false,
        state: { doc: { toString: () => 'ignored' } },
      });
    });

    expect(useEditorStore.getState().sql).toBe('');
  });

  it('dispatches a CodeMirror change when the store sql is updated externally', async () => {
    render(<Editor controller={makeController()} />);

    await act(async () => {
      useEditorStore.setState({ sql: 'SELECT 2' });
    });

    expect(mocks.viewDispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 0, insert: 'SELECT 2' },
    });
  });

  it('does not dispatch to CodeMirror when the store sql matches the current doc', async () => {
    // The mock view always returns '' for doc.toString(), so setting '' is a no-op
    render(<Editor controller={makeController()} />);

    await act(async () => {
      useEditorStore.setState({ sql: '' });
    });

    expect(mocks.viewDispatch).not.toHaveBeenCalled();
  });
});

describe('Editor — keyboard shortcuts', () => {
  it('registers a Mod-Enter binding (maps to Cmd+Enter on Mac, Ctrl+Enter elsewhere)', () => {
    render(<Editor controller={makeController()} />);
    expect(mocks.runBinding).not.toBeNull();
    expect(mocks.runBinding!.key).toBe('Mod-Enter');
  });

  it('Cmd+Enter (Mod-Enter) calls controller.run()', () => {
    const controller = makeController();
    render(<Editor controller={controller} />);

    act(() => {
      mocks.runBinding!.run();
    });

    expect(controller.run).toHaveBeenCalledOnce();
  });

  it('Ctrl+Enter (Mod-Enter on non-Mac) calls controller.run()', () => {
    const controller = makeController();
    render(<Editor controller={controller} />);

    act(() => {
      mocks.runBinding!.run();
    });

    expect(controller.run).toHaveBeenCalledOnce();
  });

  it('the keymap run handler returns true to signal the event was handled', () => {
    render(<Editor controller={makeController()} />);
    expect(mocks.runBinding!.run()).toBe(true);
  });

  it('uses the most recent controller via ref when the shortcut fires after a re-render', () => {
    const controller1 = makeController();
    const controller2 = makeController();

    const { rerender } = render(<Editor controller={controller1} />);
    rerender(<Editor controller={controller2} />);

    act(() => {
      mocks.runBinding!.run();
    });

    expect(controller1.run).not.toHaveBeenCalled();
    expect(controller2.run).toHaveBeenCalledOnce();
  });

  it('run binding is in the same keymap.of call as defaultKeymap and appears first', () => {
    // Regression guard: defaultKeymap includes { key: "Mod-Enter", run: insertBlankLine }.
    // If our run binding is in a separate keymap.of call that appears later in the
    // extensions array, defaultKeymap's binding wins and Ctrl+Enter inserts a blank
    // line instead of running the query (the bug on Ubuntu).
    render(<Editor controller={makeController()} />);

    // Find the call that contains our run binding
    const callWithRun = mocks.keymapCalls.find((bindings) =>
      bindings.includes(mocks.runBinding!)
    );
    expect(callWithRun).toBeDefined();

    // defaultKeymap's Mod-Enter (insertBlankLine) must be in the same call
    const defaultModEnter = mocks.keymapCalls
      .flat()
      .find((b) => b.key === 'Mod-Enter' && b !== mocks.runBinding);
    expect(defaultModEnter).toBeDefined(); // confirms real defaultKeymap was used

    expect(callWithRun).toContain(defaultModEnter);

    // And our run binding must come first so it wins
    const runIdx = callWithRun!.indexOf(mocks.runBinding!);
    const defaultIdx = callWithRun!.indexOf(defaultModEnter!);
    expect(runIdx).toBeLessThan(defaultIdx);
  });
});
