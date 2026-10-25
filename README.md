# TSN-scheduler

This repository hosts a Time-Sensitive Networking scheduler project.
The `network-scheduler` folder contains a Rust Cargo workspace.

The workspace is organized as:

- `crates/scheduler-core`: core scheduler library
- `crates/scheduler-io`: format parsing and serialization
- `crates/scheduler-cli`: CLI executable
- `crates/scheduler-simulation`: schedule generation and simulation engine
- `crates/scheduler-wasm`: WebAssembly bindings for the editor

The `editor` folder contains a browser-based network editor (React, TypeScript,
Vite) for drawing TSN topologies and defining streams across them. It is a
standalone frontend for now: it keeps its state in the browser and does not yet
exchange GraphML or `streams.json` files with the Rust crates. The Rust/WASM
engine generates schedules and drives packet playback; the editor displays the
simulation as animated packets and a timeline of link occupancy.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked   # one-time setup, if wasm-pack is not installed
cd editor
npm run build:wasm
npm ci
npm run dev      # http://localhost:5173
npm test         # unit tests for the model layer
npm run build    # production build in editor/dist
```

The generated `pkg` directory is local build output. Rebuild the WASM package
after changing the Rust simulation or WASM bindings, before starting or building
the editor. Frontend-only changes do not require rebuilding WASM.
