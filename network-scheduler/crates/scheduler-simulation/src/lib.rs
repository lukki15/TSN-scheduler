use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Link {
    pub id: String,
    pub source: String,
    pub target: String,
    pub length_m: f64,
    pub bandwidth_mbps: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SimulationStream {
    pub id: String,
    pub message_size: usize,
    pub period_ns: u64,
    pub route: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SimulationRequest {
    pub streams: Vec<SimulationStream>,
    pub links: Vec<Link>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HopSchedule {
    pub link_id: String,
    pub from: String,
    pub to: String,
    pub tx_start_ns: u64,
    pub tx_end_ns: u64,
    pub rx_end_ns: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamSchedule {
    pub stream_id: String,
    pub period_ns: u64,
    pub hops: Vec<HopSchedule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Schedule {
    pub streams: Vec<StreamSchedule>,
}

const PROPAGATION_NS_PER_M: u64 = 5;

pub fn transmission_ns(message_size: usize, bandwidth_mbps: f64) -> u64 {
    let bandwidth = if bandwidth_mbps.is_finite() && bandwidth_mbps > 0.0 {
        bandwidth_mbps
    } else {
        1000.0
    };
    let bits = (message_size as f64) * 8.0;
    (bits * 1000.0 / bandwidth).max(0.0) as u64
}

pub fn propagation_ns(length_m: f64) -> u64 {
    let length = if length_m.is_finite() {
        length_m.max(0.0)
    } else {
        0.0
    };
    (length * PROPAGATION_NS_PER_M as f64) as u64
}

pub fn stream_offset_ns(index: usize, count: usize, period_ns: u64) -> u64 {
    if count == 0 {
        return 0;
    }
    let numerator = index as u64 * period_ns;
    let denominator = count as u64;
    numerator / denominator
}

fn link_by_pair<'a>(links: &'a [Link], from: &str, to: &str) -> Option<&'a Link> {
    links.iter().find(|link| {
        let same_direction = link.source == from && link.target == to;
        let reverse_direction = link.source == to && link.target == from;
        same_direction || reverse_direction
    })
}

pub fn mock_schedule(request: &SimulationRequest) -> Schedule {
    let stream_count = request.streams.len();
    let mut streams = Vec::new();

    for (index, stream) in request.streams.iter().enumerate() {
        if stream.status != "ok" || stream.period_ns == 0 || stream.route.len() < 2 {
            continue;
        }

        let mut hops = Vec::new();
        let mut t = stream_offset_ns(index, stream_count, stream.period_ns);

        for window in stream.route.windows(2) {
            let from = &window[0];
            let to = &window[1];
            let Some(link) = link_by_pair(&request.links, from, to) else {
                // stale route: skip this stream until it is recomputed
                hops.clear();
                break;
            };

            let tx_start_ns = t;
            let tx_end_ns = tx_start_ns + transmission_ns(stream.message_size, link.bandwidth_mbps);
            let rx_end_ns = tx_end_ns + propagation_ns(link.length_m);
            hops.push(HopSchedule {
                link_id: link.id.clone(),
                from: from.clone(),
                to: to.clone(),
                tx_start_ns,
                tx_end_ns,
                rx_end_ns,
            });
            t = rx_end_ns;
        }

        if !hops.is_empty() {
            streams.push(StreamSchedule {
                stream_id: stream.id.clone(),
                period_ns: stream.period_ns,
                hops,
            });
        }
    }

    Schedule { streams }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn demo_request() -> SimulationRequest {
        SimulationRequest {
            streams: vec![SimulationStream {
                id: "s".to_string(),
                message_size: 128,
                period_ns: 10_000,
                route: vec!["a".to_string(), "b".to_string(), "c".to_string()],
                status: "ok".to_string(),
            }],
            links: vec![
                Link {
                    id: "ab".to_string(),
                    source: "a".to_string(),
                    target: "b".to_string(),
                    length_m: 100.0,
                    bandwidth_mbps: 1000.0,
                },
                Link {
                    id: "bc".to_string(),
                    source: "b".to_string(),
                    target: "c".to_string(),
                    length_m: 200.0,
                    bandwidth_mbps: 1000.0,
                },
            ],
        }
    }

    #[test]
    fn mock_schedule_generates_hops_for_a_valid_stream() {
        let request = demo_request();
        let schedule = mock_schedule(&request);

        assert_eq!(schedule.streams.len(), 1);
        assert_eq!(schedule.streams[0].stream_id, "s");
        assert_eq!(schedule.streams[0].hops.len(), 2);
        assert_eq!(schedule.streams[0].hops[0].link_id, "ab");
        assert_eq!(schedule.streams[0].hops[1].link_id, "bc");
        assert!(schedule.streams[0].hops[0].tx_start_ns < schedule.streams[0].hops[0].rx_end_ns);
    }

    #[test]
    fn mock_schedule_skips_invalid_streams() {
        let request = SimulationRequest {
            streams: vec![SimulationStream {
                id: "bad".to_string(),
                message_size: 64,
                period_ns: 1_000,
                route: vec!["a".to_string(), "b".to_string()],
                status: "missing-endpoint".to_string(),
            }],
            links: vec![Link {
                id: "ab".to_string(),
                source: "a".to_string(),
                target: "b".to_string(),
                length_m: 5.0,
                bandwidth_mbps: 1000.0,
            }],
        };

        let schedule = mock_schedule(&request);
        assert!(schedule.streams.is_empty());
    }

    #[test]
    fn mock_schedule_is_deterministic() {
        let first = mock_schedule(&demo_request());
        let second = mock_schedule(&demo_request());
        assert_eq!(first, second);
    }
}
