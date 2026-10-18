use crate::{Schedule, SimulationRequest, mock_schedule};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_INSTANCES_IN_FLIGHT: u64 = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineStatus {
    Stopped,
    Running,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FramePhase {
    Tx,
    Propagating,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameSnapshot {
    pub stream_id: String,
    pub link_id: String,
    pub instance: u64,
    pub direction: String,
    pub progress: f64,
    pub head: f64,
    pub tail: f64,
    pub phase: FramePhase,
    pub route_progress: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SimulationStats {
    pub generated_frames: u64,
    pub active_frames: u64,
    pub completed_frames: u64,
    pub dropped_frames: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SimulationSnapshot {
    pub elapsed_time_ns: u64,
    pub phase_time_ns: u64,
    pub hyperperiod_ns: u64,
    pub status: EngineStatus,
    pub frames: Vec<FrameSnapshot>,
    pub stats: SimulationStats,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EngineError {
    #[error("stream periods and message sizes must be safe JavaScript integers")]
    UnsafeConfigValue,
    #[error("target time exceeds JavaScript's exact integer range")]
    UnsafeTargetTime,
    #[error("schedule does not match the configured streams and links")]
    ScheduleMismatch,
    #[error("schedule timestamps exceed JavaScript's exact integer range")]
    UnsafeScheduleTimestamp,
    #[error("schedule hyperperiod exceeds JavaScript's exact integer range")]
    UnsafeHyperperiod,
    #[error("no schedule has been loaded")]
    ScheduleNotLoaded,
    #[error("there are no future frame events to step to")]
    NoFutureEvents,
    #[error("frame counters exceed JavaScript's exact integer range")]
    UnsafeFrameCount,
}

pub struct SimulationEngine {
    config: SimulationRequest,
    schedule: Option<Schedule>,
    hyperperiod_ns: u64,
    elapsed_time_ns: u64,
    status: EngineStatus,
    has_advanced: bool,
}

impl SimulationEngine {
    pub fn new(config: SimulationRequest) -> Result<Self, EngineError> {
        validate_config(&config)?;
        Ok(Self {
            config,
            schedule: None,
            hyperperiod_ns: 0,
            elapsed_time_ns: 0,
            status: EngineStatus::Stopped,
            has_advanced: false,
        })
    }

    pub fn load_schedule(&mut self, schedule: Schedule) -> Result<(), EngineError> {
        if mock_schedule(&self.config) != schedule {
            return Err(EngineError::ScheduleMismatch);
        }
        validate_schedule_timestamps(&schedule)?;
        let hyperperiod_ns = schedule_hyperperiod(&schedule)?;

        self.schedule = Some(schedule);
        self.hyperperiod_ns = hyperperiod_ns;
        self.elapsed_time_ns = 0;
        self.status = EngineStatus::Stopped;
        self.has_advanced = false;
        Ok(())
    }

    pub fn start(&mut self) -> Result<(), EngineError> {
        self.ensure_schedule()?;
        self.status = EngineStatus::Running;
        Ok(())
    }

    pub fn pause(&mut self) {
        if self.status == EngineStatus::Running {
            self.status = EngineStatus::Paused;
        }
    }

    pub fn step(&mut self) -> Result<SimulationSnapshot, EngineError> {
        self.ensure_schedule()?;
        let next = self.next_event_time()?;
        self.elapsed_time_ns = next;
        self.status = EngineStatus::Paused;
        self.has_advanced = true;
        self.snapshot()
    }

    pub fn advance_to(&mut self, time_ns: u64) -> Result<SimulationSnapshot, EngineError> {
        if time_ns > MAX_SAFE_JS_INTEGER {
            return Err(EngineError::UnsafeTargetTime);
        }
        self.ensure_schedule()?;
        if time_ns < self.elapsed_time_ns {
            self.elapsed_time_ns = 0;
        }
        self.elapsed_time_ns = time_ns;
        self.has_advanced = true;
        self.snapshot()
    }

    pub fn reset(&mut self) -> SimulationSnapshot {
        self.elapsed_time_ns = 0;
        self.status = EngineStatus::Stopped;
        self.has_advanced = false;
        self.snapshot().expect("reset snapshot is representable")
    }

    pub fn snapshot(&self) -> Result<SimulationSnapshot, EngineError> {
        let stats = self.stats()?;
        let frames = self.active_frames()?;
        Ok(SimulationSnapshot {
            elapsed_time_ns: self.elapsed_time_ns,
            phase_time_ns: if self.hyperperiod_ns == 0 {
                0
            } else {
                self.elapsed_time_ns % self.hyperperiod_ns
            },
            hyperperiod_ns: self.hyperperiod_ns,
            status: self.status,
            frames,
            stats,
        })
    }

    pub fn stats(&self) -> Result<SimulationStats, EngineError> {
        let Some(schedule) = &self.schedule else {
            return Ok(SimulationStats::default());
        };
        if !self.has_advanced {
            return Ok(SimulationStats::default());
        }
        let mut stats = SimulationStats::default();
        for stream in &schedule.streams {
            let Some(first) = stream.hops.first() else {
                continue;
            };
            let last = stream.hops.last().expect("first hop implies last hop");
            stats.generated_frames = checked_count_add(
                stats.generated_frames,
                occurrences_through(self.elapsed_time_ns, first.tx_start_ns, stream.period_ns),
            )?;
            stats.completed_frames = checked_count_add(
                stats.completed_frames,
                occurrences_through(self.elapsed_time_ns, last.rx_end_ns, stream.period_ns),
            )?;
        }
        stats.active_frames = stats
            .generated_frames
            .saturating_sub(stats.completed_frames);
        Ok(stats)
    }

    fn ensure_schedule(&self) -> Result<(), EngineError> {
        self.schedule
            .as_ref()
            .map(|_| ())
            .ok_or(EngineError::ScheduleNotLoaded)
    }

    fn next_event_time(&self) -> Result<u64, EngineError> {
        let schedule = self
            .schedule
            .as_ref()
            .ok_or(EngineError::ScheduleNotLoaded)?;
        let mut next = None;
        for stream in &schedule.streams {
            for hop in &stream.hops {
                for event in [hop.tx_start_ns, hop.tx_end_ns, hop.rx_end_ns] {
                    let candidate = next_occurrence_after(
                        event,
                        stream.period_ns,
                        self.elapsed_time_ns,
                        !self.has_advanced,
                    )?;
                    next = Some(next.map_or(candidate, |current: u64| current.min(candidate)));
                }
            }
        }
        next.ok_or(EngineError::NoFutureEvents)
    }

    fn active_frames(&self) -> Result<Vec<FrameSnapshot>, EngineError> {
        let Some(schedule) = &self.schedule else {
            return Ok(Vec::new());
        };
        if !self.has_advanced {
            return Ok(Vec::new());
        }
        let mut frames = Vec::new();
        for stream in &schedule.streams {
            let Some(first) = stream.hops.first() else {
                continue;
            };
            let last = stream.hops.last().expect("first hop implies last hop");
            let period = stream.period_ns;
            let start = first.tx_start_ns;
            let end = last.rx_end_ns;
            if period == 0 || self.elapsed_time_ns < start {
                continue;
            }

            let latest = (self.elapsed_time_ns - start) / period;
            let earliest = if self.elapsed_time_ns >= end {
                (self.elapsed_time_ns - end) / period + 1
            } else {
                0
            }
            .max(latest.saturating_sub(MAX_INSTANCES_IN_FLIGHT - 1));

            for instance in earliest..=latest {
                let instance_start = instance
                    .checked_mul(period)
                    .and_then(|offset| start.checked_add(offset))
                    .ok_or(EngineError::UnsafeScheduleTimestamp)?;
                let local_time = self.elapsed_time_ns - instance * period;
                let Some((_hop_index, hop)) =
                    stream.hops.iter().enumerate().find(|(_, hop)| {
                        local_time >= hop.tx_start_ns && local_time < hop.rx_end_ns
                    })
                else {
                    continue;
                };
                let duration = hop.rx_end_ns - hop.tx_start_ns;
                let propagation = hop.rx_end_ns - hop.tx_end_ns;
                let head = if propagation == 0 {
                    1.0
                } else {
                    clamp01((local_time - hop.tx_start_ns) as f64 / propagation as f64)
                };
                let tail = if propagation == 0 {
                    0.0
                } else {
                    clamp01((local_time.saturating_sub(hop.tx_end_ns)) as f64 / propagation as f64)
                };
                let route_duration = end - start;
                let direction = self.direction_for_link(&hop.link_id, &hop.from);
                frames.push(FrameSnapshot {
                    stream_id: stream.stream_id.clone(),
                    link_id: hop.link_id.clone(),
                    instance,
                    direction,
                    progress: if duration == 0 {
                        1.0
                    } else {
                        (local_time - hop.tx_start_ns) as f64 / duration as f64
                    },
                    head,
                    tail,
                    phase: if local_time < hop.tx_end_ns {
                        FramePhase::Tx
                    } else {
                        FramePhase::Propagating
                    },
                    route_progress: if route_duration == 0 {
                        1.0
                    } else {
                        (self.elapsed_time_ns - instance_start) as f64 / route_duration as f64
                    },
                });
            }
        }
        Ok(frames)
    }

    fn direction_for_link(&self, link_id: &str, from: &str) -> String {
        let forward = self
            .config
            .links
            .iter()
            .find(|link| link.id == link_id)
            .map(|link| link.source == from)
            .unwrap_or(true);
        if forward { "forward" } else { "reverse" }.to_string()
    }
}

fn validate_config(config: &SimulationRequest) -> Result<(), EngineError> {
    for stream in &config.streams {
        if stream.period_ns > MAX_SAFE_JS_INTEGER
            || stream.message_size as u64 > MAX_SAFE_JS_INTEGER
        {
            return Err(EngineError::UnsafeConfigValue);
        }
    }
    Ok(())
}

fn validate_schedule_timestamps(schedule: &Schedule) -> Result<(), EngineError> {
    for stream in &schedule.streams {
        if stream.period_ns == 0 || stream.period_ns > MAX_SAFE_JS_INTEGER {
            return Err(EngineError::UnsafeScheduleTimestamp);
        }
        for hop in &stream.hops {
            if [hop.tx_start_ns, hop.tx_end_ns, hop.rx_end_ns]
                .into_iter()
                .any(|time| time > MAX_SAFE_JS_INTEGER)
                || hop.tx_start_ns > hop.tx_end_ns
                || hop.tx_end_ns > hop.rx_end_ns
            {
                return Err(EngineError::UnsafeScheduleTimestamp);
            }
        }
    }
    Ok(())
}

fn schedule_hyperperiod(schedule: &Schedule) -> Result<u64, EngineError> {
    let mut periods = HashSet::new();
    let mut result = 1u64;
    for stream in &schedule.streams {
        if periods.insert(stream.period_ns) {
            result = lcm(result, stream.period_ns).ok_or(EngineError::UnsafeHyperperiod)?;
            if result > MAX_SAFE_JS_INTEGER {
                return Err(EngineError::UnsafeHyperperiod);
            }
        }
    }
    Ok(if schedule.streams.is_empty() {
        0
    } else {
        result
    })
}

fn lcm(left: u64, right: u64) -> Option<u64> {
    if left == 0 || right == 0 {
        return Some(0);
    }
    (left / gcd(left, right)).checked_mul(right)
}

fn gcd(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left
}

fn occurrences_through(time: u64, event: u64, period: u64) -> u64 {
    if period == 0 || time < event {
        0
    } else {
        (time - event) / period + 1
    }
}

fn checked_count_add(left: u64, right: u64) -> Result<u64, EngineError> {
    left.checked_add(right)
        .filter(|count| *count <= MAX_SAFE_JS_INTEGER)
        .ok_or(EngineError::UnsafeFrameCount)
}

fn next_occurrence_after(
    event: u64,
    period: u64,
    time: u64,
    include_current: bool,
) -> Result<u64, EngineError> {
    if time < event || (include_current && time == event) {
        return Ok(event);
    }
    let cycle = (time - event) / period + 1;
    event
        .checked_add(
            cycle
                .checked_mul(period)
                .ok_or(EngineError::UnsafeTargetTime)?,
        )
        .filter(|next| *next <= MAX_SAFE_JS_INTEGER)
        .ok_or(EngineError::UnsafeTargetTime)
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HopSchedule, Link, SimulationStream, StreamSchedule};

    fn config() -> SimulationRequest {
        SimulationRequest {
            streams: vec![SimulationStream {
                id: "s".into(),
                message_size: 100,
                period_ns: 1_000,
                route: vec!["a".into(), "b".into()],
                status: "ok".into(),
            }],
            links: vec![Link {
                id: "ab".into(),
                source: "a".into(),
                target: "b".into(),
                length_m: 10.0,
                bandwidth_mbps: 1000.0,
            }],
        }
    }

    fn engine() -> SimulationEngine {
        let config = config();
        let schedule = mock_schedule(&config);
        let mut engine = SimulationEngine::new(config).unwrap();
        engine.load_schedule(schedule).unwrap();
        engine
    }

    #[test]
    fn retains_state_across_lifecycle_calls_and_steps_events() {
        let mut engine = engine();
        let started = engine.start();
        assert!(started.is_ok());
        let first = engine.step().unwrap();
        assert_eq!(first.elapsed_time_ns, 0);
        assert_eq!(first.status, EngineStatus::Paused);
        assert_eq!(first.stats.generated_frames, 1);
        assert_eq!(engine.snapshot().unwrap(), first);
    }

    #[test]
    fn advance_and_backward_replay_recompute_current_state() {
        let mut engine = engine();
        let at_end = engine.advance_to(850).unwrap();
        assert_eq!(at_end.stats.completed_frames, 1);
        assert_eq!(at_end.stats.generated_frames, 1);

        let earlier = engine.advance_to(100).unwrap();
        assert_eq!(earlier.elapsed_time_ns, 100);
        assert_eq!(earlier.stats.generated_frames, 1);
        assert_eq!(earlier.stats.completed_frames, 0);
        assert_eq!(earlier.frames.len(), 1);
    }

    #[test]
    fn reset_retains_schedule_and_clears_runtime_state() {
        let mut engine = engine();
        engine.advance_to(2_000).unwrap();
        let reset = engine.reset();
        assert_eq!(reset.elapsed_time_ns, 0);
        assert_eq!(reset.status, EngineStatus::Stopped);
        assert_eq!(reset.stats, SimulationStats::default());
        assert!(engine.start().is_ok());
    }

    #[test]
    fn computes_hyperperiod_and_phase_time() {
        let mut engine = engine();
        let snapshot = engine.advance_to(1_250).unwrap();
        assert_eq!(snapshot.hyperperiod_ns, 1_000);
        assert_eq!(snapshot.phase_time_ns, 250);
    }

    #[test]
    fn rejects_mismatched_schedule_without_replacing_installed_schedule() {
        let mut engine = engine();
        let existing = engine.snapshot().unwrap();
        let invalid = Schedule {
            streams: vec![StreamSchedule {
                stream_id: "other".into(),
                period_ns: 1_000,
                hops: vec![HopSchedule {
                    link_id: "ab".into(),
                    from: "a".into(),
                    to: "b".into(),
                    tx_start_ns: 0,
                    tx_end_ns: 1,
                    rx_end_ns: 2,
                }],
            }],
        };
        assert_eq!(
            engine.load_schedule(invalid),
            Err(EngineError::ScheduleMismatch)
        );
        assert_eq!(engine.snapshot().unwrap(), existing);
    }

    #[test]
    fn rejects_times_outside_javascript_safe_integer_range() {
        let mut engine = engine();
        assert_eq!(
            engine.advance_to(MAX_SAFE_JS_INTEGER + 1),
            Err(EngineError::UnsafeTargetTime)
        );
        assert_eq!(
            SimulationEngine::new(SimulationRequest {
                streams: vec![SimulationStream {
                    period_ns: MAX_SAFE_JS_INTEGER + 1,
                    ..config().streams[0].clone()
                }],
                ..config()
            })
            .err(),
            Some(EngineError::UnsafeConfigValue)
        );
    }

    #[test]
    fn step_advances_to_the_next_distinct_timestamp() {
        let mut engine = engine();
        let first = engine.step().unwrap();
        let second = engine.step().unwrap();
        assert!(second.elapsed_time_ns > first.elapsed_time_ns);
    }
}
