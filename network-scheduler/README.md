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
cargo run -p scheduler-cli
```
