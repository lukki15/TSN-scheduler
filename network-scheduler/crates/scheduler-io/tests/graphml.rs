use scheduler_core::NodeId;
use scheduler_io::{EdgeDefault, GraphMl, GraphMlError};
use std::collections::HashMap;
use std::io::Cursor;

#[test]
fn parse_graphml_minimal_directed_graph() {
    let xml = r#"
        <?xml version="1.0" encoding="UTF-8"?>
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="directed">
                        <node id="a">
                            <data key="precision">1.0</data>
                        </node>
                        <node id="b">
                            <data key="precision">2.0</data>
                        </node>
                        <edge id="e1" source="a" target="b">
                            <data key="length">42</data>
                            <data key="bandwidth">1000</data>
                        </edge>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let parsed = GraphMl::parse(reader).expect("parse GraphML");
    assert_eq!(parsed.nodes.len(), 2);
    assert_eq!(parsed.edges.len(), 1);
    assert_eq!(parsed.edge_default, EdgeDefault::Directed);

    let graph = parsed.into_digraph().expect("into digraph");
    assert_eq!(graph.node_count(), 2);
    assert_eq!(graph.edge_count(), 1);

    let node_precisions: Vec<_> = graph.node_weights().map(|n| n.precision).collect();
    assert_eq!(node_precisions, vec![1.0, 2.0]);

    let edge = graph.edge_weights().next().expect("edge exists");
    assert_eq!(edge.length, 42.0);
    assert_eq!(edge.bandwidth, 1000.0);
}

#[test]
fn parse_node_missing_precision_errors() {
    let xml = r#"
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="directed">
                <node id="a"></node>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let err = GraphMl::parse(reader).unwrap_err();
    match err {
        GraphMlError::MissingAttribute { element, attribute } => {
            assert_eq!(element, "node");
            assert_eq!(attribute, "precision");
        }
        other => panic!("unexpected error: {:?}", other),
    }
}

#[test]
fn parse_edge_missing_length_errors() {
    let xml = r#"
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="directed">
                <node id="a"><data key="precision">1.0</data></node>
                <node id="b"><data key="precision">1.0</data></node>
                <edge id="e1" source="a" target="b">
                    <data key="bandwidth">100</data>
                </edge>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let err = GraphMl::parse(reader).unwrap_err();
    match err {
        GraphMlError::MissingAttribute { element, attribute } => {
            assert_eq!(element, "edge");
            assert_eq!(attribute, "length");
        }
        other => panic!("unexpected error: {:?}", other),
    }
}

#[test]
fn parse_edge_missing_bandwidth_errors() {
    let xml = r#"
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="directed">
                <node id="a"><data key="precision">1.0</data></node>
                <node id="b"><data key="precision">1.0</data></node>
                <edge id="e1" source="a" target="b">
                    <data key="length">10</data>
                </edge>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let err = GraphMl::parse(reader).unwrap_err();
    match err {
        GraphMlError::MissingAttribute { element, attribute } => {
            assert_eq!(element, "edge");
            assert_eq!(attribute, "bandwidth");
        }
        other => panic!("unexpected error: {:?}", other),
    }
}

#[test]
fn parse_edge_missing_both_length_and_bandwidth_errors() {
    let xml = r#"
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="directed">
                <node id="a"><data key="precision">1.0</data></node>
                <node id="b"><data key="precision">1.0</data></node>
                <edge id="e1" source="a" target="b"></edge>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let err = GraphMl::parse(reader).unwrap_err();
    match err {
        GraphMlError::MissingAttribute { element, attribute } => {
            // parser reports missing `length` first when both are absent
            assert_eq!(element, "edge");
            assert_eq!(attribute, "length");
        }
        other => panic!("unexpected error: {:?}", other),
    }
}

#[test]
fn parse_graphml_undirected_graph() {
    let xml = r#"
        <graphml xmlns="http://graphml.graphdrawing.org/xmlns">
            <graph id="G" edgedefault="undirected">
                <node id="a"><data key="precision">1.0</data></node>
                <node id="b"><data key="precision">1.0</data></node>
                <edge id="e1" source="a" target="b">
                    <data key="length">10</data>
                    <data key="bandwidth">100</data>
                </edge>
            </graph>
        </graphml>
    "#;

    let reader = Cursor::new(xml);
    let parsed = GraphMl::parse(reader).expect("parse GraphML");
    assert_eq!(parsed.edge_default, EdgeDefault::Undirected);

    let graph = parsed.into_ungraph().expect("into ungraph");
    assert_eq!(graph.node_count(), 2);
    assert_eq!(graph.edge_count(), 1);

    let node_indices: HashMap<_, _> = graph
        .node_indices()
        .map(|idx| (graph[idx].id.clone(), idx))
        .collect();
    let a = *node_indices
        .get(&NodeId("a".into()))
        .expect("node a exists");
    let b = *node_indices
        .get(&NodeId("b".into()))
        .expect("node b exists");

    assert!(
        graph.find_edge(a, b).is_some(),
        "undirected edge between a and b"
    );
}
