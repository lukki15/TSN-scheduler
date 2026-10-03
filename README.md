# TSN-scheduler

This repository hosts a Time-Sensitive Networking scheduler project.
The `network-scheduler` folder contains a Rust Cargo workspace.

The workspace is organized as:

- `crates/scheduler-core`: core scheduler library
- `crates/scheduler-io`: format parsing and serialization
- `crates/scheduler-cli`: CLI executable

The `editor` folder contains a browser-based network editor (React, TypeScript,
Vite) for drawing TSN topologies and defining streams across them. It is a
standalone frontend for now: it keeps its state in the browser and does not yet
exchange GraphML or `streams.json` files with the Rust crates.

```bash
cd editor
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the model layer
npm run build    # production build in editor/dist
```

