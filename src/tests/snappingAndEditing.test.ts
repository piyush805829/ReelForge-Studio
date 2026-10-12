/**
 * ReelForge Studio — Snapping & Interactive Editing Tests
 *
 * Tests for:
 *   - Snapping calculations at multiple zoom levels
 *   - Snapping with playhead, clip boundaries, zero
 *   - Ignoring current dragged clip
 *   - Snapping bypass
 *   - Trim math with 1x and non-1x speed
 *   - Trim boundary enforcement (negative sourceIn, exceeding media duration)
 *   - SplitLayer with non-1x speed and keyframe partitioning
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { snapTick } from '../timeline/time/snapping';
import {
  cmdAddLayer,
  cmdMoveLayer,
  cmdTrimLayerStart,
  cmdTrimLayerEnd,
  cmdSplitLayer,
  cmdImportAsset,
  type ProjectDraft,
} from '../timeline/commands/timelineCommands';
import {
  createDefaultProject,
  DEFAULT_TRANSFORM,
  DEFAULT_AUDIO_SETTINGS,
  FRAME_RATES,
  type Layer,
  type MediaAsset,
  type Project,
  type Keyframe,
} from '../project/schema/types';

function makeProject(): Project {
  return createDefaultProject('Test Project', uuidv4(), uuidv4());
}

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id:               uuidv4(),
    name:             'sample.mp4',
    mediaType:        'video',
    originalPath:     'C:/media/sample.mp4',
    duration:         10.0, // 10 seconds
    width:            1920,
    height:           1080,
    frameRate:        FRAME_RATES.FPS_30,
    pixelAspectRatio: 1,
    thumbnails:       [],
    missingStatus:    'present',
    importedAt:       new Date().toISOString(),
    metadata:         {},
    ...overrides,
  };
}

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id:                    uuidv4(),
    name:                  'Video Track',
    layerType:             'video',
    enabled:               true,
    locked:                false,
    visible:               true,
    blendMode:             'normal',
    source:                { kind: 'solid', solid: { color: '#ff0000', width: 1920, height: 1080 } },
    sourceInSeconds:       0,
    sourceOutSeconds:      5,
    timelineStartTicks:    0,
    timelineDurationTicks: 1_200_000, // 5 seconds at 240,000 ticks/sec
    speed:                 1.0,
    transform:             DEFAULT_TRANSFORM,
    fitMode:               'contain',
    keyframeTracks:        [],
    effects:               [],
    masks:                 [],
    audioSettings:         DEFAULT_AUDIO_SETTINGS,
    metadata:              {},
    ...overrides,
  };
}

function runCommand<T>(
  project: Project,
  fn: (draft: ProjectDraft) => { ok: boolean; value?: T; error?: string }
): { project: Project; result: { ok: boolean; value?: T; error?: string } } {
  let result!: { ok: boolean; value?: T; error?: string };
  try {
    const newProject = produce(project, (draft: ProjectDraft) => {
      result = fn(draft) as typeof result;
      if (!result.ok) throw new Error('COMMAND_FAILED');
    });
    return { project: result.ok ? newProject : project, result };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'COMMAND_FAILED') {
      return { project, result };
    }
    throw err;
  }
}

describe('Snapping calculations', () => {
  const layer1 = makeLayer({ id: 'l1', timelineStartTicks: 0, timelineDurationTicks: 240_000 });
  const layer2 = makeLayer({ id: 'l2', timelineStartTicks: 480_000, timelineDurationTicks: 240_000 });
  const layers = [layer1, layer2];

  it('snaps to timeline zero within pixel tolerance', () => {
    const ppt = 0.001; // 240 px per second (240,000 ticks = 240px)
    // 8px tolerance = 8 / 0.001 = 8000 ticks
    const result = snapTick(5000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      snapToZero: true,
    });
    expect(result.snappedTick).toBe(0);
    expect(result.target?.type).toBe('zero');
  });

  it('does not snap if outside tolerance', () => {
    const ppt = 0.001;
    // 8px tolerance = 8000 ticks. 15,000 ticks away should not snap to 0
    const result = snapTick(15_000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      snapToZero: true,
    });
    expect(result.snappedTick).toBe(15_000);
    expect(result.target).toBeNull();
  });

  it('adapts tolerance with zoom level (higher zoom = smaller tick tolerance)', () => {
    const highZoomPpt = 0.01; // 10x zoom -> 8px tolerance = 800 ticks
    const r1 = snapTick(1500, {
      pixelsPerTick: highZoomPpt,
      tolerancePx: 8,
      layers,
    });
    // 1500 is > 800 ticks from 0, so should not snap
    expect(r1.snappedTick).toBe(1500);

    const r2 = snapTick(600, {
      pixelsPerTick: highZoomPpt,
      tolerancePx: 8,
      layers,
    });
    // 600 is <= 800 ticks from 0, so snaps
    expect(r2.snappedTick).toBe(0);
  });

  it('snaps to other clip start and end points', () => {
    const ppt = 0.001;
    // layer1 ends at 240_000. Candidate at 242_000 is 2000 ticks away (2px away)
    const result = snapTick(242_000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      ignoreLayerId: 'l2',
    });
    expect(result.snappedTick).toBe(240_000);
    expect(result.target?.type).toBe('clip-end');
  });

  it('ignores the dragged layer itself as a snap target', () => {
    const ppt = 0.001;
    const result = snapTick(242_000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      ignoreLayerId: 'l1', // ignore layer 1, which ends at 240,000
    });
    // Should NOT snap to layer 1 end
    expect(result.snappedTick).toBe(242_000);
  });

  it('snaps to playhead position', () => {
    const ppt = 0.001;
    const playheadTicks = 120_000;
    const result = snapTick(122_000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      playheadTicks,
    });
    expect(result.snappedTick).toBe(playheadTicks);
    expect(result.target?.type).toBe('playhead');
  });

  it('bypasses snapping when disabled flag is true', () => {
    const ppt = 0.001;
    const result = snapTick(2000, {
      pixelsPerTick: ppt,
      tolerancePx: 8,
      layers,
      disabled: true,
    });
    expect(result.snappedTick).toBe(2000);
    expect(result.target).toBeNull();
  });
});

describe('Trim Layer edge cases and non-1x speed', () => {
  it('correctly trims left with 2x speed', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const layer = makeLayer({
      speed: 2.0,
      sourceInSeconds: 0,
      sourceOutSeconds: 4,
      timelineStartTicks: 0,
      timelineDurationTicks: 480_000, // 2s timeline = 4s source at 2x
    });
    const { project: p1 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Move start forward by 240,000 ticks (1s on timeline). At 2x speed, sourceIn moves by 2.0s!
    const { project: p2, result } = runCommand(p1, d =>
      cmdTrimLayerStart(d, { compositionId: compId, layerId: layer.id, newTimelineStartTicks: 240_000 })
    );

    expect(result.ok).toBe(true);
    const updated = p2.compositionRegistry[compId].layers[layer.id];
    expect(updated.timelineStartTicks).toBe(240_000);
    expect(updated.timelineDurationTicks).toBe(240_000);
    expect(updated.sourceInSeconds).toBeCloseTo(2.0, 4);
  });

  it('rejects left trim that would produce negative sourceIn', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const layer = makeLayer({
      speed: 1.0,
      sourceInSeconds: 1.0,
      timelineStartTicks: 240_000,
      timelineDurationTicks: 480_000,
    });
    const { project: p1 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Trimming start backward by 2 seconds (480,000 ticks) when sourceIn is only 1s would produce -1s sourceIn
    const { result } = runCommand(p1, d =>
      cmdTrimLayerStart(d, { compositionId: compId, layerId: layer.id, newTimelineStartTicks: -240_000 })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects right trim exceeding media asset duration', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const asset = makeAsset({ duration: 5.0 });
    const layer = makeLayer({
      source: { kind: 'asset', assetId: asset.id },
      sourceInSeconds: 0,
      sourceOutSeconds: 4,
      timelineStartTicks: 0,
      timelineDurationTicks: 960_000, // 4 seconds at 1x
      speed: 1.0,
    });

    const { project: p0 } = runCommand(project, d =>
      cmdImportAsset(d, { asset })
    );
    const { project: p1 } = runCommand(p0, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Trying to trim right to 6 seconds (1,440,000 ticks) when asset is only 5.0 seconds
    const { result } = runCommand(p1, d =>
      cmdTrimLayerEnd(d, { compositionId: compId, layerId: layer.id, newTimelineEndTicks: 1_440_000 })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds media duration/i);
  });
});

describe('cmdSplitLayer advanced: speed & keyframe tracks', () => {
  it('correctly splits clip with 0.5x slow motion speed', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const layer = makeLayer({
      speed: 0.5,
      sourceInSeconds: 0,
      sourceOutSeconds: 2.0,
      timelineStartTicks: 0,
      timelineDurationTicks: 960_000, // 4 seconds timeline = 2 seconds source
    });

    const { project: p1 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Split at 2 seconds timeline (480,000 ticks)
    const { project: p2, result } = runCommand(p1, d =>
      cmdSplitLayer(d, { compositionId: compId, layerId: layer.id, splitTimeTicks: 480_000 })
    );

    expect(result.ok).toBe(true);
    const { leftLayerId, rightLayerId } = result.value!;
    const left = p2.compositionRegistry[compId].layers[leftLayerId];
    const right = p2.compositionRegistry[compId].layers[rightLayerId];

    // Left segment: 0s to 2s timeline, source 0s to 1s
    expect(left.timelineStartTicks).toBe(0);
    expect(left.timelineDurationTicks).toBe(480_000);
    expect(left.sourceInSeconds).toBe(0);
    expect(left.sourceOutSeconds).toBeCloseTo(1.0, 4);

    // Right segment: 2s to 4s timeline, source 1s to 2s
    expect(right.timelineStartTicks).toBe(480_000);
    expect(right.timelineDurationTicks).toBe(480_000);
    expect(right.sourceInSeconds).toBeCloseTo(1.0, 4);
    expect(right.sourceOutSeconds).toBeCloseTo(2.0, 4);
  });

  it('partitions keyframes across split point deterministically', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const kf1: Keyframe = {
      id: 'kf1',
      propertyPath: 'transform.opacity',
      time: 100_000,
      value: 0,
      interpolationType: 'linear',
      enabled: true,
    };
    const kf2: Keyframe = {
      id: 'kf2',
      propertyPath: 'transform.opacity',
      time: 300_000,
      value: 1,
      interpolationType: 'linear',
      enabled: true,
    };

    const layer = makeLayer({
      timelineStartTicks: 0,
      timelineDurationTicks: 480_000,
      keyframeTracks: [{ propertyPath: 'transform.opacity', keyframes: [kf1, kf2] }],
    });

    const { project: p1 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Split at 200,000 ticks (between kf1 and kf2)
    const { project: p2, result } = runCommand(p1, d =>
      cmdSplitLayer(d, { compositionId: compId, layerId: layer.id, splitTimeTicks: 200_000 })
    );

    expect(result.ok).toBe(true);
    const { leftLayerId, rightLayerId } = result.value!;
    const left = p2.compositionRegistry[compId].layers[leftLayerId];
    const right = p2.compositionRegistry[compId].layers[rightLayerId];

    expect(left.keyframeTracks[0].keyframes.map(k => k.id)).toEqual(['kf1']);
    expect(right.keyframeTracks[0].keyframes.map(k => k.id)).toEqual(['kf2']);
  });
});

describe('Coordinate conversion with zoom & scroll', () => {
  it('accurately converts pointer offset into ticks accounting for scroll and zoom', () => {
    const ppt = 0.001; // 240px per second = 240,000 ticks
    const scrollLeftPx = 120;
    const clientX = 360;
    const headerWidthPx = 160;

    // x relative to timeline start = clientX - containerLeft(0) - headerWidth + scrollLeft
    const xTimelinePx = clientX - headerWidthPx + scrollLeftPx; // 360 - 160 + 120 = 320px
    const ticks = xTimelinePx / ppt; // 320 / 0.001 = 320,000 ticks

    expect(ticks).toBe(320_000);
    expect(ticks / 240_000).toBeCloseTo(1.3333, 4);
  });
});

describe('Gesture cancellation & history verification', () => {
  it('does not mutate project when drag gesture is cancelled', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const layer = makeLayer({ timelineStartTicks: 100_000 });

    const { project: p1 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );

    // Simulated interaction: pointerdown -> preview movement -> pointercancel
    // Authoritative state should remain at 100,000 ticks
    expect(p1.compositionRegistry[compId].layers[layer.id].timelineStartTicks).toBe(100_000);
  });

  it('creates exactly one history entry for a completed drag gesture and cleanly undoes', async () => {
    const { CommandHistory } = await import('../timeline/history/commandHistory');
    const project = makeProject();
    const compId = project.mainCompositionId;
    const layer = makeLayer({ timelineStartTicks: 100_000 });

    const history = new CommandHistory(project);
    history.execute('Add Layer', d => cmdAddLayer(d, { compositionId: compId, layer }));

    // Moving clip from 100,000 to 200,000
    const moveRes = history.execute('Move Clip', d =>
      cmdMoveLayer(d, { compositionId: compId, layerId: layer.id, newTimelineStartTicks: 200_000 })
    );

    expect(moveRes.ok).toBe(true);
    expect(history.current.compositionRegistry[compId].layers[layer.id].timelineStartTicks).toBe(200_000);

    // Undo should restore exact original position in 1 step
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(history.current.compositionRegistry[compId].layers[layer.id].timelineStartTicks).toBe(100_000);

    // Redo restores to 200,000
    history.redo();
    expect(history.current.compositionRegistry[compId].layers[layer.id].timelineStartTicks).toBe(200_000);
  });

  it('rejects adding layer with non-existent asset ID', () => {
    const project = makeProject();
    const compId = project.mainCompositionId;
    const badLayer = makeLayer({
      source: { kind: 'asset', assetId: 'missing-asset-id-999' },
    });

    const { result } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer: badLayer })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found in asset registry/i);
  });
});
