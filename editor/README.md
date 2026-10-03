# TSN Network Editor

Browser-based editor for Time-Sensitive Networking topologies. The UI and UX
are ported from [ArchAlive](https://github.com/Antigo123/ArchAlive), reduced
to what the scheduler needs: one node type, undirected links, and streams
whose routes are computed over the drawn network.

## Features

- Drag a **Node** from the left palette onto the canvas, rename it inline and set its clock `precision`.
- Connect nodes from any side handle. Links are undirected, unique per node pair, and carry `length` and `bandwidth`.
- Create **streams** in the top-right panel, pick start and end node, and set `message_size`, `period_ns`, `e2e_latency_ns` and `max_jitter_ns`.
- A stream's route is the shortest path by hop count. Selecting a stream highlights its route; streams that cannot be routed stay listed with a status badge.
- Everything autosaves to `localStorage` and is restored on reload.

## Development

```bash
npm install
npm run dev       # start vite on http://localhost:5173
npm run lint      # eslint
npx tsc -b        # typecheck
npm test          # vitest unit tests for src/model and the store
npm run build     # production build in dist/
```

## Layout

```
src/
├─ model/        pure TypeScript: types mirroring scheduler-core, graph ops, routing, streams, persistence
├─ store/        zustand store (single source of truth) and the debounced autosave hook
├─ components/   React Flow canvas, palette, node and edge renderers, inspector forms, streams panel
└─ test/         vitest unit tests
```

The types in `src/model/types.ts` mirror `network-scheduler/crates/scheduler-core/src/types.rs`
field by field so that a GraphML / `streams.json` serializer can be added without touching the UI.
Routing is behind the `RoutingStrategy` interface in `src/model/routing.ts`; the shortest-path
default can be swapped for another algorithm without UI changes.

## Controls

| Action | Input |
|---|---|
| Add node | drag from palette |
| Connect | drag from a handle to another node's handle |
| Select | click node, link or stream row |
| Delete | select, then Delete or Backspace |
| Pan | hold Space + left drag, or middle/right drag |
| Box select | left drag on empty canvas |
| Zoom | mouse wheel |
