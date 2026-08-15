use std::io::BufRead;

use scheduler_core::Stream;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum JsonError {
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error("validation error: {0}")]
    Validation(String),
}

pub fn parse_streams<R: BufRead>(mut r: R) -> Result<Vec<Stream>, JsonError> {
    let mut s = String::new();
    r.read_to_string(&mut s)
        .map_err(|e| JsonError::Validation(format!("read error: {}", e)))?;
    let streams: Vec<Stream> = serde_json::from_str(&s)?;

    for (i, st) in streams.iter().enumerate() {
        if st.message_size == 0 {
            return Err(JsonError::Validation(format!(
                "stream[{}].message_size must be > 0",
                i
            )));
        }
        if st.period_ns == 0 {
            return Err(JsonError::Validation(format!(
                "stream[{}].period_ns must be > 0",
                i
            )));
        }
    }

    Ok(streams)
}
