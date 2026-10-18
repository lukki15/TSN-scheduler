use scheduler_simulation::{EngineError, SimulationEngine, SimulationRequest, mock_schedule};
use wasm_bindgen::prelude::*;

const MAX_SAFE_JS_INTEGER: f64 = 9_007_199_254_740_991.0;

#[wasm_bindgen]
pub struct Simulation {
    engine: SimulationEngine,
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<Simulation, JsValue> {
        let config: SimulationRequest = serde_wasm_bindgen::from_value(config)
            .map_err(|error| JsValue::from_str(&format!("invalid simulation config: {error}")))?;
        let engine = SimulationEngine::new(config).map_err(engine_error)?;
        Ok(Self { engine })
    }

    pub fn load_schedule(&mut self, schedule: JsValue) -> Result<(), JsValue> {
        let schedule = serde_wasm_bindgen::from_value(schedule)
            .map_err(|error| JsValue::from_str(&format!("invalid schedule: {error}")))?;
        self.engine.load_schedule(schedule).map_err(engine_error)
    }

    pub fn start(&mut self) -> Result<(), JsValue> {
        self.engine.start().map_err(engine_error)
    }

    pub fn pause(&mut self) {
        self.engine.pause();
    }

    pub fn step(&mut self) -> Result<JsValue, JsValue> {
        let snapshot = self.engine.step().map_err(engine_error)?;
        serde_wasm_bindgen::to_value(&snapshot)
            .map_err(|error| JsValue::from_str(&format!("unable to serialize snapshot: {error}")))
    }

    pub fn advance_to(&mut self, time_ns: f64) -> Result<JsValue, JsValue> {
        if !time_ns.is_finite()
            || time_ns < 0.0
            || time_ns.fract() != 0.0
            || time_ns > MAX_SAFE_JS_INTEGER
        {
            return Err(JsValue::from_str(
                "target time must be a non-negative safe integer",
            ));
        }
        let snapshot = self
            .engine
            .advance_to(time_ns as u64)
            .map_err(engine_error)?;
        serde_wasm_bindgen::to_value(&snapshot)
            .map_err(|error| JsValue::from_str(&format!("unable to serialize snapshot: {error}")))
    }

    pub fn reset(&mut self) -> Result<JsValue, JsValue> {
        let snapshot = self.engine.reset();
        serde_wasm_bindgen::to_value(&snapshot)
            .map_err(|error| JsValue::from_str(&format!("unable to serialize snapshot: {error}")))
    }

    pub fn snapshot(&self) -> Result<JsValue, JsValue> {
        let snapshot = self.engine.snapshot().map_err(engine_error)?;
        serde_wasm_bindgen::to_value(&snapshot)
            .map_err(|error| JsValue::from_str(&format!("unable to serialize snapshot: {error}")))
    }

    pub fn stats(&self) -> Result<JsValue, JsValue> {
        let stats = self.engine.stats().map_err(engine_error)?;
        serde_wasm_bindgen::to_value(&stats)
            .map_err(|error| JsValue::from_str(&format!("unable to serialize stats: {error}")))
    }
}

fn engine_error(error: EngineError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[wasm_bindgen]
pub fn run_mock_simulation(input_json: &str) -> Result<String, JsValue> {
    let request: SimulationRequest = serde_json::from_str(input_json)
        .map_err(|err| JsValue::from_str(&format!("invalid simulation request: {err}")))?;

    let schedule = mock_schedule(&request);
    serde_json::to_string(&schedule)
        .map_err(|err| JsValue::from_str(&format!("unable to serialize schedule: {err}")))
}
