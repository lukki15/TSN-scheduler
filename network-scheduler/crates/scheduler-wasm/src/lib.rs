use scheduler_simulation::{SimulationRequest, mock_schedule};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn run_mock_simulation(input_json: &str) -> Result<String, JsValue> {
    let request: SimulationRequest = serde_json::from_str(input_json)
        .map_err(|err| JsValue::from_str(&format!("invalid simulation request: {err}")))?;

    let schedule = mock_schedule(&request);
    serde_json::to_string(&schedule)
        .map_err(|err| JsValue::from_str(&format!("unable to serialize schedule: {err}")))
}
