// ReelForge Studio — Media IPC Commands
//
// These Tauri commands are called from the frontend via invoke().
// All paths are validated before use. No shell = true ever.
// FFmpeg is invoked via std::process::Command with explicit argument arrays.

use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::command;

/// Rational number for frame rate representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rational {
    pub numerator: u32,
    pub denominator: u32,
}

/// Audio stream metadata returned from ffprobe
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStreamInfo {
    pub sample_rate: u32,
    pub channels: u8,
    pub codec: String,
    pub duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
}

/// Video stream metadata returned from ffprobe
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoStreamInfo {
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub duration: f64,
    pub frame_rate: Rational,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
}

/// Full media probe result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaProbeResult {
    pub path: String,
    pub media_type: String,
    pub duration: f64,
    pub pixel_aspect_ratio: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_rate: Option<Rational>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_stream: Option<VideoStreamInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_stream: Option<AudioStreamInfo>,
}

/// Probe a media file using ffprobe.
/// Returns structured metadata. Rejects path traversal.
///
/// Safety: uses Command::new("ffprobe") with explicit args. Never shell=true.
#[command]
pub async fn probe_media_file(path: String) -> Result<MediaProbeResult, String> {
    // Basic path validation — reject obvious traversal patterns
    if path.contains("..") {
        return Err("Invalid path: contains '..'".to_string());
    }
    if !std::path::Path::new(&path).exists() {
        return Err(format!("File not found: {path}"));
    }

    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {e}. Is FFmpeg installed and in PATH?"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    parse_ffprobe_output(&json_str, &path)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))
}

/// Parse ffprobe JSON output into MediaProbeResult
fn parse_ffprobe_output(json: &str, path: &str) -> Result<MediaProbeResult, String> {
    let val: serde_json::Value =
        serde_json::from_str(json).map_err(|e| e.to_string())?;

    let format = &val["format"];
    let streams = val["streams"].as_array().cloned().unwrap_or_default();

    let duration: f64 = format["duration"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    let mut video_stream: Option<VideoStreamInfo> = None;
    let mut audio_stream: Option<AudioStreamInfo> = None;

    for stream in &streams {
        match stream["codec_type"].as_str() {
            Some("video") if video_stream.is_none() => {
                let w = stream["width"].as_u64().unwrap_or(0) as u32;
                let h = stream["height"].as_u64().unwrap_or(0) as u32;
                let codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();
                let v_dur = stream["duration"]
                    .as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(duration);

                // Parse r_frame_rate like "30/1" or "30000/1001"
                let fr = parse_rational(stream["r_frame_rate"].as_str().unwrap_or("30/1"));

                video_stream = Some(VideoStreamInfo {
                    width: w,
                    height: h,
                    codec,
                    duration: v_dur,
                    frame_rate: fr,
                    bitrate: stream["bit_rate"]
                        .as_str()
                        .and_then(|s| s.parse::<u32>().ok()),
                });
            }
            Some("audio") if audio_stream.is_none() => {
                let sr = stream["sample_rate"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(48000);
                let ch = stream["channels"].as_u64().unwrap_or(2) as u8;
                let codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();
                let a_dur = stream["duration"]
                    .as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(duration);

                audio_stream = Some(AudioStreamInfo {
                    sample_rate: sr,
                    channels: ch,
                    codec,
                    duration: a_dur,
                    bitrate: stream["bit_rate"]
                        .as_str()
                        .and_then(|s| s.parse::<u32>().ok()),
                });
            }
            _ => {}
        }
    }

    let media_type = if video_stream.is_some() {
        "video"
    } else if audio_stream.is_some() {
        "audio"
    } else {
        "image"
    };

    let (width, height, frame_rate) = if let Some(ref v) = video_stream {
        (Some(v.width), Some(v.height), Some(v.frame_rate.clone()))
    } else {
        (None, None, None)
    };

    Ok(MediaProbeResult {
        path: path.to_string(),
        media_type: media_type.to_string(),
        duration,
        pixel_aspect_ratio: 1.0,
        width,
        height,
        frame_rate,
        video_stream,
        audio_stream,
    })
}

fn parse_rational(s: &str) -> Rational {
    let parts: Vec<&str> = s.split('/').collect();
    match parts.as_slice() {
        [num, den] => Rational {
            numerator:   num.parse().unwrap_or(30),
            denominator: den.parse().unwrap_or(1),
        },
        _ => Rational { numerator: 30, denominator: 1 },
    }
}

/// Generate a thumbnail for a media file using ffmpeg.
/// Returns the path to the generated thumbnail file.
#[command]
pub async fn generate_thumbnail(
    source_path: String,
    output_path: String,
    at_seconds: f64,
    width: u32,
) -> Result<String, String> {
    if source_path.contains("..") || output_path.contains("..") {
        return Err("Invalid path: contains '..'".to_string());
    }

    let at_str = format!("{at_seconds:.3}");
    let scale  = format!("{width}:-1");

    let status = Command::new("ffmpeg")
        .args([
            "-y",                 // overwrite output
            "-ss", &at_str,       // seek (before -i for fast seeking)
            "-i", &source_path,
            "-vframes", "1",      // one frame
            "-vf", &format!("scale={scale}"),
            "-q:v", "3",          // JPEG quality
            &output_path,
        ])
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if status.success() {
        Ok(output_path)
    } else {
        Err("FFmpeg thumbnail generation failed".to_string())
    }
}

/// Return the FFmpeg version string (for compatibility checking)
#[command]
pub async fn get_ffmpeg_version() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(["-version"])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    let text = String::from_utf8_lossy(&output.stdout);
    let first_line = text.lines().next().unwrap_or("unknown").to_string();
    Ok(first_line)
}
