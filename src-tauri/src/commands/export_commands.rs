// ReelForge Studio — Export Command Handler
// Invokes FFmpeg with explicit argument vectors.
// Security: No raw shell execution; argument array used directly.

use std::process::Command;
use tauri::command;

#[command]
pub async fn export_timeline_clip(
    args: Vec<String>,
    output_path: String,
) -> Result<String, String> {
    if output_path.contains("..") {
        return Err("Invalid output path: contains '..'".to_string());
    }

    let status = Command::new("ffmpeg")
        .args(&args)
        .status()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;

    if status.success() {
        Ok(output_path)
    } else {
        Err(format!(
            "FFmpeg export process exited with failure (code: {:?})",
            status.code()
        ))
    }
}
