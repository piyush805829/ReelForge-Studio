// Path validation utilities
use std::path::Path;

/// Reject paths containing ".." to prevent directory traversal.
pub fn validate_path(path: &str) -> Result<(), String> {
    if path.contains("..") {
        return Err(format!("Rejected path with '..': {path}"));
    }
    if !Path::new(path).exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    Ok(())
}
