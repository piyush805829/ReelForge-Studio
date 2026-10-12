// Safe process runner — wraps std::process::Command
// Never uses shell = true
use std::process::{Command, Output};

/// Run an external process with an explicit argument list.
/// Returns stdout/stderr on success.
pub fn run_process(program: &str, args: &[&str]) -> Result<Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute '{program}': {e}"))
}
