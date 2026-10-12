/**
 * ReelForge Studio — Timeline Snapping Utility
 *
 * Provides deterministic snapping calculations in project ticks.
 * Snapping tolerance is configured in screen pixels and dynamically converted
 * to ticks based on the current zoom level (pixelsPerTick).
 */

import type { Layer, Ticks } from '../../project/schema/types';

export interface SnapTarget {
  readonly tick: Ticks;
  readonly type: 'zero' | 'playhead' | 'clip-start' | 'clip-end';
  readonly label?: string;
}

export interface SnapOptions {
  /** Screen tolerance in pixels (default: 8px) */
  tolerancePx?: number;
  /** Current zoom level (pixels per tick) */
  pixelsPerTick: number;
  /** All layers in the current composition */
  layers: ReadonlyArray<Layer>;
  /** ID of the layer being moved or trimmed (ignored as a snap target) */
  ignoreLayerId?: string;
  /** Current playhead position in ticks */
  playheadTicks?: Ticks;
  /** Whether to snap to timeline zero (default: true) */
  snapToZero?: boolean;
  /** Whether snapping is explicitly disabled (e.g. modifier key held) */
  disabled?: boolean;
}

export interface SnapResult {
  /** The resulting tick position (snapped or original) */
  snappedTick: Ticks;
  /** The target that was snapped to, or null if no snap occurred */
  target: SnapTarget | null;
  /** Distance in screen pixels to the snap target */
  distancePx: number;
}

/**
 * Collect all eligible snap targets from the timeline, excluding the specified layer.
 */
export function getSnapTargets(options: {
  layers: ReadonlyArray<Layer>;
  ignoreLayerId?: string;
  playheadTicks?: Ticks;
  snapToZero?: boolean;
}): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const seenTicks = new Set<Ticks>();

  function addTarget(tick: Ticks, type: SnapTarget['type'], label?: string) {
    if (tick < 0) return;
    if (!seenTicks.has(tick)) {
      seenTicks.add(tick);
      targets.push({ tick, type, label });
    }
  }

  // 1. Timeline Zero
  if (options.snapToZero !== false) {
    addTarget(0, 'zero', 'Timeline Start');
  }

  // 2. Playhead
  if (options.playheadTicks !== undefined && options.playheadTicks >= 0) {
    addTarget(options.playheadTicks, 'playhead', 'Playhead');
  }

  // 3. Other clip starts and ends
  for (const layer of options.layers) {
    if (layer.id === options.ignoreLayerId) continue;
    if (!layer.enabled || !layer.visible) continue;

    const start = layer.timelineStartTicks;
    const end = start + layer.timelineDurationTicks;

    addTarget(start, 'clip-start', `${layer.name} Start`);
    addTarget(end, 'clip-end', `${layer.name} End`);
  }

  return targets;
}

/**
 * Find the nearest snap target for a given candidate tick.
 *
 * @param candidateTick - The candidate position before snapping.
 * @param options - Snapping configuration and context.
 * @returns SnapResult containing the snapped position and matching target.
 */
export function snapTick(candidateTick: Ticks, options: SnapOptions): SnapResult {
  if (options.disabled || options.pixelsPerTick <= 0) {
    return {
      snappedTick: Math.max(0, Math.round(candidateTick)),
      target: null,
      distancePx: 0,
    };
  }

  const tolerancePx = options.tolerancePx ?? 8;
  const toleranceTicks = tolerancePx / options.pixelsPerTick;

  const targets = getSnapTargets({
    layers: options.layers,
    ignoreLayerId: options.ignoreLayerId,
    playheadTicks: options.playheadTicks,
    snapToZero: options.snapToZero,
  });

  let closestTarget: SnapTarget | null = null;
  let minDiffTicks = Infinity;

  for (const target of targets) {
    const diffTicks = Math.abs(candidateTick - target.tick);
    if (diffTicks <= toleranceTicks) {
      if (diffTicks < minDiffTicks) {
        minDiffTicks = diffTicks;
        closestTarget = target;
      }
    }
  }

  if (closestTarget) {
    const distancePx = minDiffTicks * options.pixelsPerTick;
    return {
      snappedTick: closestTarget.tick,
      target: closestTarget,
      distancePx,
    };
  }

  return {
    snappedTick: Math.max(0, Math.round(candidateTick)),
    target: null,
    distancePx: 0,
  };
}
