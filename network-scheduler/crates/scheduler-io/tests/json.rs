use std::io::Cursor;

use scheduler_io::{JsonError, parse_streams};

#[test]
fn parse_single_stream() {
    let json = r#"
    [
      {
        "name": "s1",
        "message_size": 128,
        "period_ns": 1000000,
        "e2e_latency_ns": 500000,
        "max_jitter_ns": 10000,
        "start_node": "n1",
        "end_node": "n2"
      }
    ]
    "#;

    let streams = parse_streams(Cursor::new(json)).expect("parse streams");
    assert_eq!(streams.len(), 1);
    let s = &streams[0];
    assert_eq!(s.name, "s1");
    assert_eq!(s.message_size, 128);
    assert_eq!(s.period_ns, 1_000_000);
    assert_eq!(s.e2e_latency_ns, 500_000);
    assert_eq!(s.max_jitter_ns, 10_000);
    assert_eq!(s.start_node.0, "n1");
    assert_eq!(s.end_node.0, "n2");
}

#[test]
fn parse_multiple_streams() {
    let json = r#"
    [
      {"name":"s1","message_size":64,"period_ns":1000000,"e2e_latency_ns":200000,"max_jitter_ns":1000,"start_node":"a","end_node":"b"},
      {"name":"s2","message_size":256,"period_ns":2000000,"e2e_latency_ns":400000,"max_jitter_ns":2000,"start_node":"b","end_node":"c"}
    ]
    "#;

    let streams = parse_streams(Cursor::new(json)).expect("parse streams");
    assert_eq!(streams.len(), 2);
}

#[test]
fn missing_field_error() {
    let json = r#"[{ "message_size": 64 } ]"#; // missing required fields like name

    let err = parse_streams(Cursor::new(json)).unwrap_err();
    match err {
        JsonError::Serde(_) => {}
        _ => panic!("expected serde error for missing field, got {:?}", err),
    }
}

#[test]
fn invalid_type_error() {
    let json = r#"[{ "name": "s", "message_size": "big", "period_ns": 100 } ]"#;

    let err = parse_streams(Cursor::new(json)).unwrap_err();
    match err {
        JsonError::Serde(_) => {}
        _ => panic!("expected serde error for invalid type, got {:?}", err),
    }
}

#[test]
fn validation_error() {
    let json = r#"[
      {"name":"s","message_size":0,"period_ns":1000000,"e2e_latency_ns":0,"max_jitter_ns":0,"start_node":"a","end_node":"b"}
    ]"#;

    let err = parse_streams(Cursor::new(json)).unwrap_err();
    match err {
        JsonError::Validation(_) => {}
        _ => panic!("expected validation error, got {:?}", err),
    }
}
