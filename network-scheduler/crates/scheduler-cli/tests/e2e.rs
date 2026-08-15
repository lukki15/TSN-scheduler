use assert_cmd::Command;
use predicates::str::contains;

#[test]
fn end_to_end_prints_schedule_to_stdout_when_no_output() {
    let mut cmd = Command::cargo_bin("scheduler-cli").unwrap();
    cmd.args([
        "-g",
        "../../examples/graphml.xml",
        "-s",
        "../../examples/streams.json",
    ]);
    cmd.assert().success().stdout(contains("{}"));
}

#[test]
fn missing_inputs_fail() {
    let mut cmd = Command::cargo_bin("scheduler-cli").unwrap();
    // missing graph
    cmd.args(["-s", "tests/fixtures/streams.json"]);
    cmd.assert().failure();

    let mut cmd2 = Command::cargo_bin("scheduler-cli").unwrap();
    // missing stream
    cmd2.args(["-g", "tests/fixtures/graphml.xml"]);
    cmd2.assert().failure();
}
