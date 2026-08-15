use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct NodeId(pub String);

#[derive(Debug, Clone)]
pub struct NodeData {
    pub id: NodeId,
    pub precision: f64,
}

#[derive(Debug, Clone)]
pub struct EdgeData {
    pub id: Option<String>,
    pub length: f64,
    pub bandwidth: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Stream {
    pub name: String,
    pub message_size: usize,
    pub period_ns: u64,
    pub e2e_latency_ns: u64,
    pub max_jitter_ns: u64,
    pub start_node: NodeId,
    pub end_node: NodeId,
}
