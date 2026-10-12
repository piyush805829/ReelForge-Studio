/**
 * ReelForge Studio — Time Conversion Utilities
 *
 * All time math for converting between:
 *   - Seconds (floating point, source/display)
 *   - Ticks (integer, internal timeline representation)
 *   - Frame indices (integer, per composition frame rate)
 *   - Pixel offsets (derived for UI, NEVER stored)
 *
 * Timebase: 240,000 ticks per second
 */

import { PROJECT_TIMEBASE, type Rational, type Ticks } from '../../project/schema/types';

// ─── Core Conversions ─────────────────────────────────────────────────────────

/**
 * Convert seconds to ticks (rounds to nearest tick).
 * Use this for converting source media timestamps to timeline ticks.
 */
export function secondsToTicks(seconds: number): Ticks {
  return Math.round(seconds * PROJECT_TIMEBASE);
}

/**
 * Convert ticks to seconds (exact rational result).
 */
export function ticksToSeconds(ticks: Ticks): number {
  return ticks / PROJECT_TIMEBASE;
}

/**
 * Evaluate a Rational as a floating-point number.
 */
export function rationalToNumber(r: Rational): number {
  if (r.denominator === 0) throw new Error('Rational with zero denominator');
  return r.numerator / r.denominator;
}

/**
 * Compute ticks per frame for a given frame rate.
 * Returns a rational result to avoid repeated rounding.
 * For display purposes, round with ticksPerFrameRounded().
 */
export function ticksPerFrameExact(frameRate: Rational): number {
  return PROJECT_TIMEBASE / rationalToNumber(frameRate);
}

/**
 * Rounded integer ticks per frame.
 * Warning: rounding introduces a small error. Use rational arithmetic for
 * accumulated offsets (e.g. when seeking by many frames).
 */
export function ticksPerFrameRounded(frameRate: Rational): number {
  return Math.round(ticksPerFrameExact(frameRate));
}

// ─── Frame / Tick Conversions ─────────────────────────────────────────────────

/**
 * Convert a zero-based frame index to ticks.
 * Uses exact (non-rounded) ticks-per-frame to minimize accumulated error.
 */
export function frameToTicks(frameIndex: number, frameRate: Rational): Ticks {
  return Math.round(frameIndex * ticksPerFrameExact(frameRate));
}

/**
 * Convert ticks to a frame index (floor — the current frame at that tick).
 */
export function ticksToFrame(ticks: Ticks, frameRate: Rational): number {
  return Math.floor(ticks / ticksPerFrameExact(frameRate));
}

/**
 * Snap ticks to the nearest frame boundary.
 */
export function snapToFrame(ticks: Ticks, frameRate: Rational): Ticks {
  const frame = Math.round(ticks / ticksPerFrameExact(frameRate));
  return frameToTicks(frame, frameRate);
}

// ─── UI Pixel Conversions ─────────────────────────────────────────────────────

/**
 * Convert ticks to UI pixels given a zoom scale.
 * @param ticks       - timeline position
 * @param pixelsPerTick - UI zoom level (pixels per tick)
 * @returns pixel offset from timeline start (NEVER stored in project)
 */
export function ticksToPixels(ticks: Ticks, pixelsPerTick: number): number {
  return ticks * pixelsPerTick;
}

/**
 * Convert UI pixels back to ticks given a zoom scale.
 * @param pixels        - pixel offset from timeline start
 * @param pixelsPerTick - UI zoom level
 * @returns ticks (NOT rounded to frame — caller should snap if needed)
 */
export function pixelsToTicks(pixels: number, pixelsPerTick: number): Ticks {
  if (pixelsPerTick === 0) return 0;
  return pixels / pixelsPerTick;
}

// ─── Duration Helpers ─────────────────────────────────────────────────────────

/**
 * Format ticks as a human-readable timecode string.
 * Format: HH:MM:SS:FF (frames)
 */
export function ticksToTimecode(ticks: Ticks, frameRate: Rational): string {
  const totalFrames = ticksToFrame(ticks, frameRate);
  const fps = Math.round(rationalToNumber(frameRate));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '00'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Parse a "HH:MM:SS:FF" timecode string to ticks.
 */
export function timecodeToTicks(timecode: string, frameRate: Rational): Ticks {
  const parts = timecode.split(':').map(Number);
  if (parts.length !== 4) throw new Error(`Invalid timecode: ${timecode}`);
  const [h, m, s, f] = parts;
  const fps = rationalToNumber(frameRate);
  const totalSeconds = h * 3600 + m * 60 + s;
  const totalFrames = Math.round(totalSeconds * fps) + f;
  return frameToTicks(totalFrames, frameRate);
}

/**
 * Format seconds as a simple display string "m:ss.ms"
 */
export function secondsToDisplayTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

/**
 * Assert that a tick value is non-negative.
 */
export function assertNonNegativeTicks(ticks: Ticks, context: string): void {
  if (ticks < 0) throw new Error(`${context}: ticks must be ≥ 0, got ${ticks}`);
}

/**
 * Assert that a duration tick value is strictly positive.
 */
export function assertPositiveDuration(ticks: Ticks, context: string): void {
  if (ticks <= 0) throw new Error(`${context}: duration must be > 0, got ${ticks}`);
}

/**
 * Clamp a value to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp ticks to [0, maxTicks].
 */
export function clampTicks(ticks: Ticks, maxTicks: Ticks): Ticks {
  return Math.max(0, Math.min(maxTicks, ticks));
}
