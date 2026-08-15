use assert_cmd::Command;
use predicates::str::contains;

#[test]
fn prints_version() {
    let mut cmd = Command::cargo_bin("scheduler-cli").unwrap();
    cmd.arg("--version");
    cmd.assert()
        .success()
        .stdout(contains(env!("CARGO_PKG_VERSION")));
}

#[test]
fn prints_help() {
    let mut cmd = Command::cargo_bin("scheduler-cli").unwrap();
    cmd.arg("--help");
    cmd.assert().success().stdout(contains("Usage"));
}
