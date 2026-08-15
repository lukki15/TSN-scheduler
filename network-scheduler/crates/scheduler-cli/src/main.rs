use std::fs::File;
use std::io::{BufReader, Read};
use std::path::PathBuf;

use anyhow::Context;
use clap::Parser;

use scheduler_io::{GraphMl, parse_streams};

#[derive(Parser, Debug)]
#[command(name = "scheduler-cli", version = env!("CARGO_PKG_VERSION"))]
struct Args {
    // GraphML file describing the network topology
    #[arg(short = 'g', long = "graph")]
    graph: PathBuf,

    // JSON file describing streams and routes
    #[arg(short = 's', long = "stream")]
    stream: PathBuf,

    // Output file to write the schedule to (will be created/truncated). If omitted, prints to stdout.
    #[arg(short = 'o', long = "output", required = false)]
    output: Option<PathBuf>,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {:#}", err);
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let args = Args::parse();

    // Open and parse graph (GraphML)
    let graph_file =
        File::open(&args.graph).with_context(|| format!("opening graph file {:?}", args.graph))?;
    let mut graph_reader = BufReader::new(graph_file);
    let mut graph_buf = String::new();
    graph_reader.read_to_string(&mut graph_buf)?;
    let graph = GraphMl::parse(std::io::Cursor::new(graph_buf))?;

    // Open and parse streams (JSON)
    let stream_file = File::open(&args.stream)
        .with_context(|| format!("opening stream file {:?}", args.stream))?;
    let stream_reader = BufReader::new(stream_file);
    let streams = parse_streams(stream_reader)?;

    // For now, we don't have a scheduling implementation here;
    // write a minimal placeholder to the output file so the CLI completes.
    if let Some(out) = &args.output {
        std::fs::write(out, b"{}")?;
        println!("Wrote output to {:?}", out);
    } else {
        println!("{}", serde_json::to_string_pretty(&serde_json::json!({}))?);
    }

    // Suppress unused variable warnings while wiring is in place
    let _ = (graph, streams);

    Ok(())
}
