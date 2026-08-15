# Network Scheduler

This repository is a Rust Cargo workspace for a network traffic scheduler.

## Project structure

- `Cargo.toml`
  - Workspace manifest. It lists the crate members and enables shared dependency management.

- `crates/`
  - `scheduler-core/`
    - Core library crate with scheduler models, algorithms, and timing abstractions.
    - Contains reusable scheduling logic that does not depend on CLI or file formats.
  - `scheduler-io/`
    - I/O library crate for format conversion.
    - Contains GraphML import, traffic parsing, and schedule serialization logic.
    - Depends on `scheduler-core`.
  - `scheduler-cli/`
    - Binary crate for the command-line interface.
    - Parses arguments and orchestrates I/O and scheduling.
    - Depends on both `scheduler-core` and `scheduler-io`.

## Getting started

From the `network-scheduler` root:

```bash
cargo check
cargo run -p scheduler-cli -- -h
```

## Example: run the CLI with example fixtures

Two example input files are provided in the `examples/` directory: `examples/graphml.xml` (GraphML topology) and `examples/streams.json` (streams description). To run the CLI and print a schedule to stdout:

```bash
cargo run -p scheduler-cli -- -g examples/graphml.xml -s examples/streams.json
```

To write the schedule to a file instead of printing to stdout, pass `-o`/`--output`:

```bash
cargo run -p scheduler-cli -- -g examples/graphml.xml -s examples/streams.json -o out.json
```

These files are intended as usage examples; feel free to modify them to exercise different topologies and streams.
