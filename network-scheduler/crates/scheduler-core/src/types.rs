#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
