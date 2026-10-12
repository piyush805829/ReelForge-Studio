/**
 * ReelForge Studio — Timeline Command Tests
 *
 * Tests for all editing commands: AddLayer, DeleteLayer, MoveLayer,
 * TrimLayerStart, TrimLayerEnd, SplitLayer, DuplicateLayer, ReorderLayer,
 * SetClipSpeed, CreateComposition.
 *
 * Tests run without any UI rendering.
 */

import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import {
  cmdAddLayer,
  cmdDeleteLayer,
  cmdMoveLayer,
  cmdTrimLayerStart,
  cmdSplitLayer,
  cmdSetClipSpeed,
  cmdImportAsset,
  type ProjectDraft,
} from '../timeline/commands/timelineCommands';
import {
  createDefaultProject,
  DEFAULT_TRANSFORM,
  FRAME_RATES,
  type Layer,
  type MediaAsset,
  type Project,
} from '../project/schema/types';
import { secondsToTicks } from '../timeline/time/timeConversions';

// ─── Fixture Factories ────────────────────────────────────────────────────────

function makeProject(): Project {
  return createDefaultProject('Test Project', uuidv4(), uuidv4());
}

function makeAsset(overrides?: Partial<MediaAsset>): MediaAsset {
  return {
    id:               uuidv4(),
    mediaType:        'video',
    originalPath:     'C:\\test\\video.mp4',
    name:             'video.mp4',
    duration:         10,
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

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id:                    uuidv4(),
    name:                  'Test Layer',
    layerType:             'video',
    enabled:               true,
    locked:                false,
    visible:               true,
    blendMode:             'normal',
    source:                { kind: 'solid', solid: { color: '#ff0000', width: 100, height: 100 } },
    sourceInSeconds:       0,
    sourceOutSeconds:      10,
    timelineStartTicks:    0,
    timelineDurationTicks: secondsToTicks(10),
    speed:                 1,
    transform:             DEFAULT_TRANSFORM,
    fitMode:               'contain',
    keyframeTracks:        [],
    effects:               [],
    masks:                 [],
    metadata:              {},
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('cmdImportAsset', () => {
  it('adds an asset to the registry', () => {
    const project = makeProject();
    const asset   = makeAsset();
    const { project: next, result } = runCommand(project, d => cmdImportAsset(d, { asset }));
    expect(result.ok).toBe(true);
    expect(next.assetRegistry[asset.id]).toBeDefined();
    expect(next.assetRegistry[asset.id].name).toBe('video.mp4');
  });

  it('rejects duplicate asset IDs', () => {
    const project = makeProject();
    const asset   = makeAsset();
    const { project: p2 } = runCommand(project, d => cmdImportAsset(d, { asset }));
    const { result } = runCommand(p2, d => cmdImportAsset(d, { asset }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already exists/i);
  });
});

describe('cmdAddLayer', () => {
  it('adds a layer to the composition', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer();
    const { project: next, result } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );
    expect(result.ok).toBe(true);
    const comp = next.compositionRegistry[compId];
    expect(comp.layers[layer.id]).toBeDefined();
    expect(comp.orderedLayerIds).toContain(layer.id);
  });

  it('rejects zero-duration layers', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({ timelineDurationTicks: 0 });
    const { result } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-positive duration/i);
  });

  it('rejects negative timeline start', () => {
    const project = makeProject();
    const layer   = makeLayer({ timelineStartTicks: -1 });
    expect(() => runCommand(project, d =>
      cmdAddLayer(d, { compositionId: project.mainCompositionId, layer })
    )).toThrow();
  });

  it('inserts at specified index', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layerA  = makeLayer({ name: 'A' });
    const layerB  = makeLayer({ name: 'B' });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer: layerA }));
    const { project: p3 } = runCommand(p2,      d => cmdAddLayer(d, { compositionId: compId, layer: layerB, insertAtIndex: 0 }));
    expect(p3.compositionRegistry[compId].orderedLayerIds[0]).toBe(layerB.id);
  });
});

describe('cmdDeleteLayer', () => {
  it('removes layer from composition', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer();
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3, result } = runCommand(p2, d => cmdDeleteLayer(d, { compositionId: compId, layerId: layer.id }));
    expect(result.ok).toBe(true);
    expect(p3.compositionRegistry[compId].layers[layer.id]).toBeUndefined();
    expect(p3.compositionRegistry[compId].orderedLayerIds).not.toContain(layer.id);
  });

  it('fails for non-existent layer', () => {
    const project = makeProject();
    const { result } = runCommand(project, d =>
      cmdDeleteLayer(d, { compositionId: project.mainCompositionId, layerId: 'bad-id' })
    );
    expect(result.ok).toBe(false);
  });
});

describe('cmdMoveLayer', () => {
  it('updates timeline start without changing source in/out', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({ sourceInSeconds: 2, sourceOutSeconds: 8 });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3, result } = runCommand(p2, d =>
      cmdMoveLayer(d, { compositionId: compId, layerId: layer.id, newTimelineStartTicks: secondsToTicks(5) })
    );
    expect(result.ok).toBe(true);
    const moved = p3.compositionRegistry[compId].layers[layer.id];
    expect(moved.timelineStartTicks).toBe(secondsToTicks(5));
    // Source in/out must be UNCHANGED
    expect(moved.sourceInSeconds).toBe(2);
    expect(moved.sourceOutSeconds).toBe(8);
  });

  it('rejects negative timeline start', () => {
    const project = makeProject();
    const layer   = makeLayer();
    const { project: p2 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: project.mainCompositionId, layer })
    );
    expect(() => runCommand(p2, d =>
      cmdMoveLayer(d, { compositionId: project.mainCompositionId, layerId: layer.id, newTimelineStartTicks: -1 })
    )).toThrow();
  });
});

describe('cmdTrimLayerStart', () => {
  it('shortens duration and adjusts sourceIn', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({
      sourceInSeconds:       0,
      sourceOutSeconds:      10,
      timelineStartTicks:    0,
      timelineDurationTicks: secondsToTicks(10),
      speed:                 1,
    });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3, result } = runCommand(p2, d =>
      cmdTrimLayerStart(d, { compositionId: compId, layerId: layer.id, newTimelineStartTicks: secondsToTicks(2) })
    );
    expect(result.ok).toBe(true);
    const trimmed = p3.compositionRegistry[compId].layers[layer.id];
    expect(trimmed.timelineStartTicks).toBe(secondsToTicks(2));
    expect(trimmed.timelineDurationTicks).toBe(secondsToTicks(8));
    expect(trimmed.sourceInSeconds).toBeCloseTo(2, 4);
  });

  it('rejects trim past the end', () => {
    const project = makeProject();
    const layer   = makeLayer({ timelineDurationTicks: secondsToTicks(5) });
    const { project: p2 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: project.mainCompositionId, layer })
    );
    const { result } = runCommand(p2, d =>
      cmdTrimLayerStart(d, {
        compositionId: project.mainCompositionId,
        layerId: layer.id,
        newTimelineStartTicks: secondsToTicks(6), // past end
      })
    );
    expect(result.ok).toBe(false);
  });
});

describe('cmdSplitLayer', () => {
  it('creates two layers with correct source in/out', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({
      sourceInSeconds:       0,
      sourceOutSeconds:      10,
      timelineStartTicks:    0,
      timelineDurationTicks: secondsToTicks(10),
      speed:                 1,
    });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3, result } = runCommand(p2, d =>
      cmdSplitLayer(d, { compositionId: compId, layerId: layer.id, splitTimeTicks: secondsToTicks(4) })
    );
    expect(result.ok).toBe(true);
    const comp = p3.compositionRegistry[compId];
    expect(comp.orderedLayerIds).toHaveLength(2);

    const [leftId, rightId] = comp.orderedLayerIds as string[];
    const left  = comp.layers[leftId];
    const right = comp.layers[rightId];

    expect(left.timelineStartTicks).toBe(0);
    expect(left.timelineDurationTicks).toBe(secondsToTicks(4));
    expect(left.sourceInSeconds).toBeCloseTo(0, 5);
    expect(left.sourceOutSeconds).toBeCloseTo(4, 4);

    expect(right.timelineStartTicks).toBe(secondsToTicks(4));
    expect(right.timelineDurationTicks).toBe(secondsToTicks(6));
    expect(right.sourceInSeconds).toBeCloseTo(4, 4);
    expect(right.sourceOutSeconds).toBeCloseTo(10, 4);
  });

  it('rejects split outside layer bounds', () => {
    const project = makeProject();
    const layer   = makeLayer({ timelineDurationTicks: secondsToTicks(5) });
    const { project: p2 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: project.mainCompositionId, layer })
    );
    const { result } = runCommand(p2, d =>
      cmdSplitLayer(d, {
        compositionId: project.mainCompositionId,
        layerId: layer.id,
        splitTimeTicks: secondsToTicks(7), // outside
      })
    );
    expect(result.ok).toBe(false);
  });

  it('original layer ID is removed after split', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({ timelineDurationTicks: secondsToTicks(10) });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3 } = runCommand(p2, d =>
      cmdSplitLayer(d, { compositionId: compId, layerId: layer.id, splitTimeTicks: secondsToTicks(5) })
    );
    const comp = p3.compositionRegistry[compId];
    expect(comp.layers[layer.id]).toBeUndefined();
    expect(comp.orderedLayerIds).not.toContain(layer.id);
  });
});

describe('cmdSetClipSpeed', () => {
  it('adjusts timeline duration when speed is doubled', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    const layer   = makeLayer({
      sourceInSeconds:       0,
      sourceOutSeconds:      10,
      timelineDurationTicks: secondsToTicks(10),
      speed:                 1,
    });
    const { project: p2 } = runCommand(project, d => cmdAddLayer(d, { compositionId: compId, layer }));
    const { project: p3, result } = runCommand(p2, d =>
      cmdSetClipSpeed(d, { compositionId: compId, layerId: layer.id, speed: 2 })
    );
    expect(result.ok).toBe(true);
    const updated = p3.compositionRegistry[compId].layers[layer.id];
    expect(updated.speed).toBe(2);
    expect(updated.timelineDurationTicks).toBe(secondsToTicks(5)); // half duration
  });

  it('rejects zero speed', () => {
    const project = makeProject();
    const layer   = makeLayer();
    const { project: p2 } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: project.mainCompositionId, layer })
    );
    const { result } = runCommand(p2, d =>
      cmdSetClipSpeed(d, { compositionId: project.mainCompositionId, layerId: layer.id, speed: 0 })
    );
    expect(result.ok).toBe(false);
  });
});

describe('circular composition reference prevention', () => {
  it('rejects adding a composition that would nest itself', () => {
    const project = makeProject();
    const compId  = project.mainCompositionId;
    // Layer that nests the composition into itself
    const layer = makeLayer({
      source: { kind: 'composition', compositionId: compId },
    });
    const { result } = runCommand(project, d =>
      cmdAddLayer(d, { compositionId: compId, layer })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/circular/i);
  });
});

describe('undo / redo via CommandHistory', () => {
  it('undo restores state before add', async () => {
    const { CommandHistory } = await import('../timeline/history/commandHistory');
    const project = makeProject();
    const history = new CommandHistory(project);
    const compId  = project.mainCompositionId;
    const layer   = makeLayer();

    history.execute('Add Layer', d => cmdAddLayer(d, { compositionId: compId, layer }));
    expect(Object.keys(history.current.compositionRegistry[compId].layers)).toHaveLength(1);

    history.undo();
    expect(Object.keys(history.current.compositionRegistry[compId].layers)).toHaveLength(0);
  });

  it('redo re-applies after undo', async () => {
    const { CommandHistory } = await import('../timeline/history/commandHistory');
    const project = makeProject();
    const history = new CommandHistory(project);
    const compId  = project.mainCompositionId;
    const layer   = makeLayer();

    history.execute('Add Layer', d => cmdAddLayer(d, { compositionId: compId, layer }));
    history.undo();
    history.redo();
    expect(Object.keys(history.current.compositionRegistry[compId].layers)).toHaveLength(1);
  });

  it('failed command does not create history entry', async () => {
    const { CommandHistory } = await import('../timeline/history/commandHistory');
    const project = makeProject();
    const history = new CommandHistory(project);
    const compId  = project.mainCompositionId;
    const badLayer = makeLayer({ timelineDurationTicks: 0 }); // invalid

    history.execute('Bad Add', d => cmdAddLayer(d, { compositionId: compId, layer: badLayer }));
    expect(history.canUndo).toBe(false);
  });
});
