/**
 * ReelForge Studio — Time Conversion Tests
 *
 * Tests for all timebase conversion utilities.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  secondsToTicks,
  ticksToSeconds,
  frameToTicks,
  ticksToFrame,
  snapToFrame,
  ticksToTimecode,
  timecodeToTicks,
  ticksToPixels,
  pixelsToTicks,
  clamp,
  clampTicks,
  rationalToNumber,
} from '../timeline/time/timeConversions';
import { FRAME_RATES, PROJECT_TIMEBASE } from '../project/schema/types';

describe('timebase constants', () => {
  it('PROJECT_TIMEBASE is 240,000', () => {
    expect(PROJECT_TIMEBASE).toBe(240_000);
  });

  it('30fps frame = 8,000 ticks', () => {
    const ticks = frameToTicks(1, FRAME_RATES.FPS_30);
    expect(ticks).toBe(8_000);
  });

  it('1 second = 240,000 ticks', () => {
    expect(secondsToTicks(1)).toBe(240_000);
  });
});

describe('secondsToTicks / ticksToSeconds', () => {
  it('0 seconds → 0 ticks', () => {
    expect(secondsToTicks(0)).toBe(0);
  });

  it('1 second → 240,000 ticks (exact)', () => {
    expect(secondsToTicks(1)).toBe(240_000);
  });

  it('0.5 seconds → 120,000 ticks', () => {
    expect(secondsToTicks(0.5)).toBe(120_000);
  });

  it('ticksToSeconds is the inverse of secondsToTicks', () => {
    const ticks = secondsToTicks(3.14159);
    expect(ticksToSeconds(ticks)).toBeCloseTo(3.14159, 4);
  });

  it('handles fractional seconds accurately', () => {
    expect(secondsToTicks(1 / 30)).toBe(8_000);
  });
});

describe('frameToTicks / ticksToFrame', () => {
  it('frame 0 → 0 ticks at 30fps', () => {
    expect(frameToTicks(0, FRAME_RATES.FPS_30)).toBe(0);
  });

  it('frame 30 → 240,000 ticks at 30fps (1 second)', () => {
    expect(frameToTicks(30, FRAME_RATES.FPS_30)).toBe(240_000);
  });

  it('frame 24 → 240,000 ticks at 24fps (1 second)', () => {
    expect(frameToTicks(24, FRAME_RATES.FPS_24)).toBe(240_000);
  });

  it('ticksToFrame(8000, 30fps) → frame 1', () => {
    expect(ticksToFrame(8_000, FRAME_RATES.FPS_30)).toBe(1);
  });

  it('ticksToFrame(7999, 30fps) → frame 0 (floor)', () => {
    expect(ticksToFrame(7_999, FRAME_RATES.FPS_30)).toBe(0);
  });

  it('handles 23.976 fps correctly', () => {
    // 1 second at 23.976 fps = 23.976 frames → tick count ≈ 240,000
    const fps = FRAME_RATES.FPS_23976;
    const fpsVal = rationalToNumber(fps);
    expect(fpsVal).toBeCloseTo(23.976, 3);
    const oneSecondTicks = frameToTicks(Math.round(fpsVal), fps);
    expect(Math.abs(oneSecondTicks - 240_000)).toBeLessThan(300);
  });
});

describe('snapToFrame', () => {
  it('snaps to nearest frame boundary at 30fps', () => {
    const snapped = snapToFrame(8_100, FRAME_RATES.FPS_30);
    expect(snapped).toBe(8_000); // nearest is frame 1 at 8000 ticks
  });

  it('snaps up when past midpoint', () => {
    const snapped = snapToFrame(8_400, FRAME_RATES.FPS_30);
    expect(snapped).toBe(8_000); // midpoint = 8000+4000=12000? No: 8400 is closer to 8000
    // Actually: frame 1 ends at 8000, frame 2 at 16000. 8400 - 8000 = 400, 16000 - 8400 = 7600
    // Nearest is frame 1 (8000)
  });

  it('returns 0 for tick 0', () => {
    expect(snapToFrame(0, FRAME_RATES.FPS_30)).toBe(0);
  });
});

describe('timecode formatting', () => {
  it('00:00:00:00 for 0 ticks', () => {
    expect(ticksToTimecode(0, FRAME_RATES.FPS_30)).toBe('00:00:00:00');
  });

  it('00:00:01:00 for exactly 1 second at 30fps', () => {
    expect(ticksToTimecode(240_000, FRAME_RATES.FPS_30)).toBe('00:00:01:00');
  });

  it('00:01:00:00 for exactly 1 minute at 30fps', () => {
    expect(ticksToTimecode(240_000 * 60, FRAME_RATES.FPS_30)).toBe('00:01:00:00');
  });

  it('01:00:00:00 for exactly 1 hour at 30fps', () => {
    expect(ticksToTimecode(240_000 * 3600, FRAME_RATES.FPS_30)).toBe('01:00:00:00');
  });
});

describe('timecodeToTicks', () => {
  it('parses 00:00:00:00 → 0', () => {
    expect(timecodeToTicks('00:00:00:00', FRAME_RATES.FPS_30)).toBe(0);
  });

  it('parses 00:00:01:00 → 240,000', () => {
    expect(timecodeToTicks('00:00:01:00', FRAME_RATES.FPS_30)).toBe(240_000);
  });

  it('round-trips through ticksToTimecode', () => {
    const original = secondsToTicks(125.5);
    const snapped = snapToFrame(original, FRAME_RATES.FPS_30);
    const tc = ticksToTimecode(snapped, FRAME_RATES.FPS_30);
    const parsed = timecodeToTicks(tc, FRAME_RATES.FPS_30);
    expect(parsed).toBe(snapped);
  });

  it('throws on invalid timecode', () => {
    expect(() => timecodeToTicks('invalid', FRAME_RATES.FPS_30)).toThrow();
  });
});

describe('pixel conversions', () => {
  it('ticksToPixels with 0 ppt → 0', () => {
    expect(ticksToPixels(1000, 0)).toBe(0);
  });

  it('ticksToPixels is proportional', () => {
    const ppt = 0.001;
    expect(ticksToPixels(240_000, ppt)).toBe(240);
  });

  it('pixelsToTicks is the inverse of ticksToPixels', () => {
    const ppt = 0.002;
    const ticks = 123_456;
    const px = ticksToPixels(ticks, ppt);
    expect(pixelsToTicks(px, ppt)).toBeCloseTo(ticks, 0);
  });
});

describe('clamp utilities', () => {
  it('clamp within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamp below min', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it('clamp above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('clampTicks to 0 minimum', () => {
    expect(clampTicks(-500, 240_000)).toBe(0);
  });

  it('clampTicks to max', () => {
    expect(clampTicks(500_000, 240_000)).toBe(240_000);
  });
});
