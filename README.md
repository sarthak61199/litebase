# litebase

A 100% client-side PostgreSQL playground. Real Postgres 17 runs in your browser — no backend, no setup, no data leaving your machine.

## Features

- **Real PostgreSQL 17** — powered by [PGlite](https://pglite.dev/) (WASM), not a SQL emulator
- **Non-blocking execution** — queries run inside a Web Worker so the UI never freezes
- **Two-layer cancellation** — soft-cancel rejects the UI promise instantly; hard-stop terminates and restarts the worker if it's stuck
- **SQL editor** — CodeMirror 6 with SQL syntax highlighting and a blinking cursor
- **Virtualized result table** — handles large result sets without lag via `@tanstack/react-virtual`
- **Row cap** — results capped at 10 000 rows with a `capped` indicator
- **Configurable timeout** — per-query timeout settable from the toolbar
- **Ephemeral by design** — data lives in `memory://`; a fresh DB on every reload (and after a hard-stop)

## Tech Stack

| Concern | Library |
|---|---|
| Runtime SQL engine | [PGlite](https://pglite.dev/) (`@electric-sql/pglite`) |
| UI framework | [React 19](https://react.dev/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| SQL editor | [CodeMirror 6](https://codemirror.net/) + `@codemirror/lang-sql` |
| Result table | `@tanstack/react-virtual` |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| Build tool | [Vite](https://vitejs.dev/) |
| Unit/integration tests | [Vitest](https://vitest.dev/) |
| E2E tests | [Playwright](https://playwright.dev/) |
| Type checking | TypeScript 6 |

## Getting Started

```bash
npm install
npm run dev        # dev server on http://localhost:3000
```

## Commands

```bash
npm run dev           # start dev server
npm run build         # tsc -b + vite build → dist/
npm run test          # vitest run (all tests)
npm run test:coverage # vitest run --coverage (80% gate)
npm run test:e2e      # playwright e2e (auto-starts preview server)
```
