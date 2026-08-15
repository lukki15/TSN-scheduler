use petgraph::graph::{DiGraph, UnGraph};
use quick_xml::Reader;
use quick_xml::events::{BytesStart, Event};
use scheduler_core::{EdgeData, NodeData, NodeId};
use std::collections::HashMap;
use std::io::BufRead;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GraphMlError {
    #[error("XML error: {0}")]
    Xml(#[from] quick_xml::Error),

    #[error("missing required attribute `{attribute}` on <{element}>")]
    MissingAttribute { element: String, attribute: String },

    #[error("unknown node `{0}")]
    UnknownNode(String),

    #[error("invalid graph direction `{0}")]
    InvalidEdgeDefault(String),

    #[error("GraphML contains multiple <graph> elements")]
    MultipleGraphs,

    #[error("GraphML contains no <graph> element")]
    NoGraph,

    #[error("unexpected XML element `{0}")]
    UnexpectedElement(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeDefault {
    Directed,
    Undirected,
}

impl EdgeDefault {
    fn from_str(value: &str) -> Result<Self, GraphMlError> {
        match value {
            "directed" => Ok(Self::Directed),
            "undirected" => Ok(Self::Undirected),
            other => Err(GraphMlError::InvalidEdgeDefault(other.to_owned())),
        }
    }
}

#[derive(Debug)]
pub struct GraphMl {
    pub nodes: Vec<NodeData>,
    pub edges: Vec<EdgeData>,
    pub edge_endpoints: Vec<(NodeId, NodeId)>,
    pub edge_default: EdgeDefault,
}

impl GraphMl {
    pub fn new(edge_default: EdgeDefault) -> Self {
        Self {
            nodes: Vec::new(),
            edges: Vec::new(),
            edge_endpoints: Vec::new(),
            edge_default,
        }
    }

    pub fn parse<R: BufRead>(input: R) -> Result<Self, GraphMlError> {
        let mut reader = Reader::from_reader(input);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::new();
        let mut graph: Option<GraphMl> = None;

        // temporaries while parsing: keep required numeric fields optional until End
        let mut current_node: Option<(NodeId, Option<f64>)> = None; // (id, precision)
        let mut current_edge: Option<(Option<String>, Option<f64>, Option<f64>)> = None; // (id, length, bandwidth)
        let mut current_edge_source: Option<NodeId> = None;
        let mut current_edge_target: Option<NodeId> = None;
        let mut current_data_key: Option<String> = None;
        let mut current_data_value = String::new();

        loop {
            match reader.read_event_into(&mut buf)? {
                Event::Start(e) => {
                    let name_buf = e.name();
                    let name = local_name(name_buf.as_ref());

                    match name {
                        b"graph" => {
                            if graph.is_some() {
                                return Err(GraphMlError::MultipleGraphs);
                            }

                            let edge_default =
                                get_attr(&reader, &e, b"edgedefault")?.ok_or_else(|| {
                                    GraphMlError::MissingAttribute {
                                        element: "graph".into(),
                                        attribute: "edgedefault".into(),
                                    }
                                })?;

                            graph = Some(GraphMl::new(EdgeDefault::from_str(&edge_default)?));
                        }

                        b"node" => {
                            let id = get_attr(&reader, &e, b"id")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "node".into(),
                                    attribute: "id".into(),
                                }
                            })?;

                            current_node = Some((NodeId(id), None));
                        }

                        b"edge" => {
                            let source = get_attr(&reader, &e, b"source")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "edge".into(),
                                    attribute: "source".into(),
                                }
                            })?;

                            let target = get_attr(&reader, &e, b"target")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "edge".into(),
                                    attribute: "target".into(),
                                }
                            })?;

                            let id = get_attr(&reader, &e, b"id")?;

                            current_edge = Some((id, None, None));
                            current_edge_source = Some(NodeId(source));
                            current_edge_target = Some(NodeId(target));
                        }

                        b"data" => {
                            let key = get_attr(&reader, &e, b"key");
                            current_data_key = key?;
                            current_data_value.clear();
                        }

                        b"key" | b"default" | b"graphml" => {}

                        other => {
                            if other != b"desc" && other != b"locator" {
                                // intentionally ignored GraphML extensions
                            }
                        }
                    }
                }

                Event::Empty(e) => {
                    let name_buf = e.name();
                    let name = local_name(name_buf.as_ref());

                    match name {
                        b"node" => {
                            let _id = get_attr(&reader, &e, b"id")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "node".into(),
                                    attribute: "id".into(),
                                }
                            })?;

                            // Empty node element — required `precision` missing
                            return Err(GraphMlError::MissingAttribute {
                                element: "node".into(),
                                attribute: "precision".into(),
                            });
                        }

                        b"edge" => {
                            let _source = get_attr(&reader, &e, b"source")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "edge".into(),
                                    attribute: "source".into(),
                                }
                            })?;

                            let _target = get_attr(&reader, &e, b"target")?.ok_or_else(|| {
                                GraphMlError::MissingAttribute {
                                    element: "edge".into(),
                                    attribute: "target".into(),
                                }
                            })?;

                            // Empty edge element — required `length` and `bandwidth` missing
                            return Err(GraphMlError::MissingAttribute {
                                element: "edge".into(),
                                attribute: "length".into(),
                            });
                        }

                        b"data" => {
                            let key = get_attr(&reader, &e, b"key")?;
                            if let Some(key) = key {
                                // Empty <data/> with no value — treat as missing required data
                                if let Some((_id, _precision)) = current_node.as_mut() {
                                    if key == "precision" {
                                        return Err(GraphMlError::MissingAttribute {
                                            element: "node".into(),
                                            attribute: "precision".into(),
                                        });
                                    }
                                } else if let Some((_id, _length, _bandwidth)) =
                                    current_edge.as_mut()
                                {
                                    if key == "length" {
                                        return Err(GraphMlError::MissingAttribute {
                                            element: "edge".into(),
                                            attribute: "length".into(),
                                        });
                                    } else if key == "bandwidth" {
                                        return Err(GraphMlError::MissingAttribute {
                                            element: "edge".into(),
                                            attribute: "bandwidth".into(),
                                        });
                                    }
                                }
                            }
                        }

                        _ => {}
                    }
                }

                Event::Text(e) => {
                    if current_data_key.is_some() {
                        current_data_value
                            .push_str(&e.decode().map_err(|e| GraphMlError::Xml(e.into()))?);
                    }
                }

                Event::CData(e) => {
                    if current_data_key.is_some() {
                        current_data_value.push_str(&String::from_utf8_lossy(e.as_ref()));
                    }
                }

                Event::End(e) => {
                    let name_buf = e.name();
                    let name = local_name(name_buf.as_ref());

                    match name {
                        b"data" => {
                            if let Some(key) = current_data_key.take() {
                                let value = std::mem::take(&mut current_data_value);
                                if let Some(node) = current_node.as_mut() {
                                    if key == "precision" {
                                        let parsed = value.trim().parse::<f64>().map_err(|_| {
                                            GraphMlError::MissingAttribute {
                                                element: "node".into(),
                                                attribute: "precision".into(),
                                            }
                                        })?;
                                        node.1 = Some(parsed);
                                    }
                                } else if let Some(edge) = current_edge.as_mut() {
                                    if key == "length" {
                                        let parsed = value.trim().parse::<f64>().map_err(|_| {
                                            GraphMlError::MissingAttribute {
                                                element: "edge".into(),
                                                attribute: "length".into(),
                                            }
                                        })?;
                                        edge.1 = Some(parsed);
                                    } else if key == "bandwidth" {
                                        let parsed = value.trim().parse::<f64>().map_err(|_| {
                                            GraphMlError::MissingAttribute {
                                                element: "edge".into(),
                                                attribute: "bandwidth".into(),
                                            }
                                        })?;
                                        edge.2 = Some(parsed);
                                    }
                                }
                            }
                        }

                        b"node" => {
                            if let Some((id, precision_opt)) = current_node.take() {
                                let precision = precision_opt.ok_or_else(|| {
                                    GraphMlError::MissingAttribute {
                                        element: "node".into(),
                                        attribute: "precision".into(),
                                    }
                                })?;
                                graph_mut(&mut graph)?
                                    .nodes
                                    .push(NodeData { id, precision });
                            }
                        }

                        b"edge" => {
                            if let Some((id_opt, length_opt, bandwidth_opt)) = current_edge.take() {
                                let length =
                                    length_opt.ok_or_else(|| GraphMlError::MissingAttribute {
                                        element: "edge".into(),
                                        attribute: "length".into(),
                                    })?;
                                let bandwidth = bandwidth_opt.ok_or_else(|| {
                                    GraphMlError::MissingAttribute {
                                        element: "edge".into(),
                                        attribute: "bandwidth".into(),
                                    }
                                })?;
                                let source = current_edge_source.take().unwrap();
                                let target = current_edge_target.take().unwrap();
                                let g = graph_mut(&mut graph)?;
                                g.edges.push(EdgeData {
                                    id: id_opt,
                                    length,
                                    bandwidth,
                                });
                                g.edge_endpoints.push((source, target));
                            }
                        }

                        _ => {}
                    }
                }

                Event::Eof => break,
                _ => {}
            }
            buf.clear();
        }

        graph.ok_or(GraphMlError::NoGraph)
    }

    pub fn into_digraph(self) -> Result<DiGraph<NodeData, EdgeData>, GraphMlError> {
        let mut graph = DiGraph::new();
        let mut indices = HashMap::new();

        for node in self.nodes {
            let id = node.id.clone();
            let index = graph.add_node(node);
            indices.insert(id, index);
        }

        for (edge, (source, target)) in self.edges.into_iter().zip(self.edge_endpoints) {
            let source_index = indices
                .get(&source)
                .copied()
                .ok_or_else(|| GraphMlError::UnknownNode(source.0.clone()))?;
            let target_index = indices
                .get(&target)
                .copied()
                .ok_or_else(|| GraphMlError::UnknownNode(target.0.clone()))?;
            graph.add_edge(source_index, target_index, edge);
        }

        Ok(graph)
    }

    pub fn into_ungraph(self) -> Result<UnGraph<NodeData, EdgeData>, GraphMlError> {
        let mut graph = UnGraph::new_undirected();
        let mut indices = HashMap::new();

        for node in self.nodes {
            let id = node.id.clone();
            let index = graph.add_node(node);
            indices.insert(id, index);
        }

        for (edge, (source, target)) in self.edges.into_iter().zip(self.edge_endpoints) {
            let source_index = indices
                .get(&source)
                .copied()
                .ok_or_else(|| GraphMlError::UnknownNode(source.0.clone()))?;
            let target_index = indices
                .get(&target)
                .copied()
                .ok_or_else(|| GraphMlError::UnknownNode(target.0.clone()))?;
            graph.add_edge(source_index, target_index, edge);
        }

        Ok(graph)
    }
}

fn graph_mut(graph: &mut Option<GraphMl>) -> Result<&mut GraphMl, GraphMlError> {
    graph.as_mut().ok_or(GraphMlError::NoGraph)
}

fn local_name(name: &[u8]) -> &[u8] {
    match name.iter().position(|&b| b == b':') {
        Some(pos) => &name[pos + 1..],
        None => name,
    }
}

fn get_attr<R: BufRead>(
    reader: &Reader<R>,
    element: &BytesStart<'_>,
    wanted: &[u8],
) -> Result<Option<String>, GraphMlError> {
    for attr in element.attributes().with_checks(false) {
        let attr = attr.map_err(|err| GraphMlError::Xml(err.into()))?;
        if local_name(attr.key.as_ref()) == wanted {
            return Ok(Some(
                attr.decoded_and_normalized_value(
                    quick_xml::XmlVersion::Explicit1_0,
                    reader.decoder(),
                )?
                .into_owned(),
            ));
        }
    }
    Ok(None)
}
