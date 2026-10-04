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
- Every stream has its own color, used for its row, its route highlight and its packets.
- **Playback** (bottom-left): Play, Pause and Stop, speed steps 0.5x to 4x, and a clock in µs. While playing, every routed stream's frames move along the drawn links, one transmission per period, hop by hop. A frame is drawn as a bar from its last bit to its first bit, so a long frame on a short link fills the link while a short frame travels as a short bar. Streams sharing a link ride separate lanes.
- **Timeline dock** under the canvas: one row group per link with a sub-row per direction, bars for every transmission over one hyperperiod (solid while sending, lighter while the bits are still on the wire). A playhead follows the clock and can be dragged to scrub; clicking the ruler jumps. Hovering a row highlights the link on the canvas, hovering a bar shows its times, clicking a bar selects the stream. Links without traffic collapse into a footer line. The dock collapses and resizes; its size is remembered.
- Everything autosaves to `localStorage` and is restored on reload. Playback always starts stopped at `t = 0`.

## Schedule (mocked for now)

The animation is driven by a `Schedule`: for every stream, one transmission per
period described hop by hop with `tx_start_ns`, `tx_end_ns` and `rx_end_ns`
offsets. Today it comes from `mockScheduler` in `src/model/schedule.ts`, which
spreads streams across their period and chains hops store-and-forward using
`message_size / bandwidth` for transmission and `5 ns/m × length` for
propagation. Timing correctness is not the point yet; the UI is.

Playback runs in slow motion: 1 ms of simulated time takes 2 s at 1x.

The timeline shows one **hyperperiod**, the least common multiple of all stream
periods, and the playhead wraps around it. When that multiple would exceed 64
times the longest period, the dock falls back to the longest period and shows a
"capped" badge; streams with other periods then do not repeat exactly inside
the window.

### Replacing the mock scheduler

Implement the `Scheduler` interface (`src/model/schedule.ts`) and point
`defaultScheduler` at it, or map the Rust scheduler's output onto the `Schedule`
shape. Nothing in the rendering path depends on how the times were produced.

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
├─ model/        pure TypeScript: types mirroring scheduler-core, graph ops, routing, streams, persistence,
│                schedule (Scheduler seam + mock), packets (positions and lanes), playback clock, bezier geometry, colors,
│                timeline (hyperperiod, rows, lanes, ruler ticks)
├─ store/        zustand editor store (single source of truth), playback store, ui store (hover, dock prefs),
│                debounced autosave hook
├─ components/   React Flow canvas, palette, node and edge renderers, inspector forms, streams panel,
│                playback controls, PixiJS packet layer, timeline dock (ruler, rows, playhead, tooltip)
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
| Play / Pause / Stop | timeline toolbar; Stop resets to t = 0 |
| Speed | 0.5x, 1x, 2x, 4x next to the transport buttons |
| Seek | drag the playhead handle, or click / drag on the ruler or empty row space |
| Timeline size | drag the dock's top edge; chevron collapses it to the toolbar |
| Idle links | "show" / "hide" in the footer line of the timeline |
| Pan | hold Space + left drag, or middle/right drag |
| Box select | left drag on empty canvas |
| Zoom | mouse wheel |
