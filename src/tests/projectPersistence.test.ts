/**
 * ReelForge Studio — Milestone 3: Project Persistence Test Suite
 *
 * Covers:
 *   - Round-trip serialization & deserialization
 *   - Preservation of all supported project fields & fractional frame rates
 *   - Integer tick precision preservation (no drift)
 *   - Deterministic JSON output for stable diffs
 *   - Invalid JSON syntax & schema validation
 *   - Cycle detection in nested compositions
 *   - Referential integrity (layer -> asset, layer -> comp)
 *   - Unsupported future schema versions
 *   - Schema migration from v0 to v1
 *   - Missing media detection & non-blocking project loading
 *   - Media relinking with immutable asset ID preservation & type validation
 *   - Batch relinking from directory
 *   - Autosave debounce & overlapping-write protection
 *   - Recovery snapshot creation & cleanup
 *   - Save cancellation and failure dirty-flag preservation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  FRAME_RATES,
  type Project,
  type Layer,
  type MediaAsset,
} from '../project/schema/types';
import {
  serializeProject,
  deserializeProject,
  validateProject,
  deterministicStringify,
} from '../project/serialization/projectSerializer';
import { migrateProject, MigrationError } from '../project/migrations/projectMigrator';
import {
  detectMissingMedia,
  relinkSingleAsset,
  batchRelinkFromDirectory,
  isMediaTypeCompatible,
} from '../project/media/mediaRelinker';
import {
  AutosaveManager,
  saveRecoverySnapshot,
  getRecoverySnapshot,
  clearRecoverySnapshot,
} from '../project/autosave/autosaveManager';

// Mock localStorage for test environment
const mockStorage: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(mockStorage)) {
    delete mockStorage[k];
  }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => {
      for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    },
  });
  if (typeof HTMLAnchorElement !== 'undefined') {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  }
});

function createTestProject(): Project {
  const assetId = 'asset-1111-2222';
  const mainCompId = 'comp-main-0001';
  const layerId = 'layer-clip-0001';

  const asset: MediaAsset = {
    id: assetId,
    mediaType: 'video',
    originalPath: 'C:/Media/footage_4k.mp4',
    name: 'footage_4k.mp4',
    duration: 10.5,
    width: 3840,
    height: 2160,
    frameRate: FRAME_RATES.FPS_23976,
    pixelAspectRatio: 1.0,
    videoStream: {
      width: 3840,
      height: 2160,
      frameRate: FRAME_RATES.FPS_23976,
      codec: 'h264',
      duration: 10.5,
    },
    audioStream: {
      sampleRate: 48000,
      channels: 2,
      codec: 'aac',
      duration: 10.5,
    },
    thumbnails: [],
    missingStatus: 'present',
    importedAt: '2026-10-12T10:00:00.000Z',
    metadata: { camera: 'Sony FX3', iso: 800 },
  };

  const layer: Layer = {
    id: layerId,
    name: 'Intro Clip',
    layerType: 'video',
    enabled: true,
    locked: false,
    visible: true,
    blendMode: 'normal',
    source: { kind: 'asset', assetId },
    sourceInSeconds: 1.5,
    sourceOutSeconds: 6.5,
    timelineStartTicks: 240_000,       // 1 second in at 240,000 tps
    timelineDurationTicks: 1_200_000,  // 5 seconds
    speed: 1.0,
    transform: {
      positionX: 0,
      positionY: 0,
      scaleX: 1.0,
      scaleY: 1.0,
      rotation: 0,
      anchorX: 0,
      anchorY: 0,
      opacity: 1.0,
    },
    fitMode: 'contain',
    keyframeTracks: [
      {
        propertyPath: 'transform.opacity',
        keyframes: [
          {
            id: 'kf-1',
            propertyPath: 'transform.opacity',
            time: 0,
            value: 0,
            interpolationType: 'linear',
            enabled: true,
          },
          {
            id: 'kf-2',
            propertyPath: 'transform.opacity',
            time: 240_000,
            value: 1,
            interpolationType: 'linear',
            enabled: true,
          },
        ],
      },
    ],
    effects: [],
    masks: [],
    audioSettings: {
      volume: 0.8,
      mute: false,
      fadeInTicks: 24_000,
      fadeOutTicks: 24_000,
      pan: 0,
      keyframeTracks: [],
    },
    metadata: {},
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj-uuid-1234',
    name: 'Cinema Commercial Edit',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:05:00.000Z',
    projectFilePath: 'C:/Projects/Cinema Commercial Edit.rfproj',
    compositionRegistry: {
      [mainCompId]: {
        id: mainCompId,
        name: 'Main Edit',
        width: 1920,
        height: 1080,
        frameRate: FRAME_RATES.FPS_23976,
        durationTicks: 7_200_000, // 30 seconds
        background: '#000000',
        orderedLayerIds: [layerId],
        layers: {
          [layerId]: layer,
        },
        markers: [
          { id: 'marker-1', timeTicks: 240_000, label: 'Cut 1', color: '#ff0000' },
        ],
        metadata: {},
      },
    },
    mainCompositionId: mainCompId,
    assetRegistry: {
      [assetId]: asset,
    },
    defaultFrameRate: FRAME_RATES.FPS_23976,
    defaultCanvas: { width: 1920, height: 1080 },
    exportDefaults: {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      frameRate: FRAME_RATES.FPS_23976,
      audioSampleRate: 48000,
    },
    metadata: { client: 'Acme Studio' },
  };
}

describe('Stage A: Serialization, Validation & Migration', () => {
  it('performs lossless round-trip serialization and deserialization', () => {
    const original = createTestProject();
    const json = serializeProject(original);

    expect(typeof json).toBe('string');
    expect(json.length).toBeGreaterThan(100);

    const result = deserializeProject(json);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.project.id).toBe(original.id);
      expect(result.project.name).toBe(original.name);
      expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.project.compositionRegistry).toEqual(original.compositionRegistry);
      expect(result.project.assetRegistry).toEqual(original.assetRegistry);
    }
  });

  it('preserves exact fractional frame rates and integer tick precision', () => {
    const project = createTestProject();
    const json = serializeProject(project);
    const result = deserializeProject(json);

    expect(result.success).toBe(true);
    if (result.success) {
      // 23.976 rational representation
      expect(result.project.defaultFrameRate.numerator).toBe(24000);
      expect(result.project.defaultFrameRate.denominator).toBe(1001);

      // Exact integer timeline ticks
      const comp = result.project.compositionRegistry[result.project.mainCompositionId];
      const layer = comp.layers['layer-clip-0001'];
      expect(Number.isInteger(layer.timelineStartTicks)).toBe(true);
      expect(layer.timelineStartTicks).toBe(240_000);
      expect(layer.timelineDurationTicks).toBe(1_200_000);
    }
  });

  it('produces deterministic JSON with sorted keys for stable file diffs', () => {
    const objA = { z: 1, a: 2, m: { y: 10, b: 20 } };
    const objB = { a: 2, m: { b: 20, y: 10 }, z: 1 };

    const strA = deterministicStringify(objA);
    const strB = deterministicStringify(objB);

    expect(strA).toBe(strB);
    const keysInStrA = [...strA.matchAll(/"([^"]+)":/g)].map(m => m[1]);
    expect(keysInStrA).toEqual(['a', 'm', 'b', 'y', 'z']);
  });

  it('handles invalid JSON syntax gracefully without unhandled exceptions', () => {
    const malformedJson = '{ "id": "test", broken json... ';
    const result = deserializeProject(malformedJson);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Malformed JSON syntax');
    }
  });

  it('validates referential integrity: layer referencing missing asset is rejected', () => {
    const invalidProject = createTestProject();
    // Point layer to non-existent asset ID
    const comp = invalidProject.compositionRegistry[invalidProject.mainCompositionId];
    const brokenLayer = {
      ...comp.layers['layer-clip-0001'],
      source: { kind: 'asset' as const, assetId: 'non-existent-asset-id' },
    };
    const modifiedComp = {
      ...comp,
      layers: { 'layer-clip-0001': brokenLayer },
    };
    const brokenProject = {
      ...invalidProject,
      compositionRegistry: { [invalidProject.mainCompositionId]: modifiedComp },
    };

    const res = validateProject(brokenProject);
    expect(res.success).toBe(false);
    if (!res.success) {
      const hasAssetError = res.errors.some(e => e.includes('non-existent-asset-id'));
      expect(hasAssetError).toBe(true);
    }
  });

  it('detects circular composition cycles across nested compositions', () => {
    const project = createTestProject();
    const compAId = project.mainCompositionId;
    const compBId = 'comp-nested-b';

    // Comp A contains a layer nesting Comp B
    // Comp B contains a layer nesting Comp A (cycle!)
    const layerInA: Layer = {
      ...project.compositionRegistry[compAId].layers['layer-clip-0001'],
      id: 'layer-nest-b',
      layerType: 'nested-composition',
      source: { kind: 'composition', compositionId: compBId },
    };

    const layerInB: Layer = {
      ...project.compositionRegistry[compAId].layers['layer-clip-0001'],
      id: 'layer-nest-a',
      layerType: 'nested-composition',
      source: { kind: 'composition', compositionId: compAId },
    };

    const cyclicProject: Project = {
      ...project,
      compositionRegistry: {
        [compAId]: {
          ...project.compositionRegistry[compAId],
          orderedLayerIds: ['layer-nest-b'],
          layers: { 'layer-nest-b': layerInA },
        },
        [compBId]: {
          ...project.compositionRegistry[compAId],
          id: compBId,
          orderedLayerIds: ['layer-nest-a'],
          layers: { 'layer-nest-a': layerInB },
        },
      },
    };

    const res = validateProject(cyclicProject);
    expect(res.success).toBe(false);
    if (!res.success) {
      const cycleError = res.errors.some(e => e.includes('Circular composition nesting cycle'));
      expect(cycleError).toBe(true);
    }
  });

  it('rejects unsupported future schema versions with explicit error', () => {
    const futureData = {
      ...createTestProject(),
      schemaVersion: 99,
    };

    expect(() => migrateProject(futureData, 99, 1)).toThrow(MigrationError);
    expect(() => migrateProject(futureData, 99, 1)).toThrow(/schema version 99/);
  });

  it('migrates unversioned prototype projects (v0) safely to v1', () => {
    const v0Data = {
      id: 'old-proj-1',
      name: 'Legacy Project',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      mainCompositionId: 'main-comp-1',
      compositionRegistry: {
        'main-comp-1': {
          id: 'main-comp-1',
          name: 'Main',
          width: 1920,
          height: 1080,
          frameRate: FRAME_RATES.FPS_30,
          durationTicks: 240_000,
          background: '#000000',
          orderedLayerIds: [],
          layers: {},
          markers: [],
          metadata: {},
        },
      },
    };

    const migrated = migrateProject(v0Data, 0, 1);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.exportDefaults).toBeDefined();
    expect(migrated.defaultFrameRate).toBeDefined();
    expect(migrated.assetRegistry).toBeDefined();
  });
});

describe('Stage D & E: Missing Media Detection and Relinking', () => {
  it('detects missing media assets without blocking project loading', async () => {
    const project = createTestProject();
    // Mark one asset path with missing marker
    const brokenAsset: MediaAsset = {
      ...project.assetRegistry['asset-1111-2222'],
      originalPath: 'missing://unreachable_drive/footage.mp4',
    };
    const projWithMissing = {
      ...project,
      assetRegistry: { [brokenAsset.id]: brokenAsset },
    };

    const { updatedProject, missingCount } = await detectMissingMedia(projWithMissing);

    expect(missingCount).toBe(1);
    expect(updatedProject.assetRegistry[brokenAsset.id].missingStatus).toBe('missing');
    expect(updatedProject.assetRegistry[brokenAsset.id].originalPath).toBe('missing://unreachable_drive/footage.mp4');
  });

  it('relinks missing asset while strictly preserving asset ID and references', () => {
    const project = createTestProject();
    const assetId = 'asset-1111-2222';
    const newPath = 'D:/NewFootage/replacement_footage.mp4';

    const result = relinkSingleAsset(project, assetId, newPath);
    expect(result.success).toBe(true);

    if (result.success && result.project) {
      const relinkedAsset = result.project.assetRegistry[assetId];
      expect(relinkedAsset.id).toBe(assetId); // MUST be preserved
      expect(relinkedAsset.relinkPath).toBe(newPath);
      expect(relinkedAsset.originalPath).toBe('C:/Media/footage_4k.mp4');
      expect(relinkedAsset.missingStatus).toBe('relinked');

      // Verify that composition layers still point to this assetId
      const comp = result.project.compositionRegistry[result.project.mainCompositionId];
      const layer = comp.layers['layer-clip-0001'];
      expect(layer.source.kind).toBe('asset');
      if (layer.source.kind === 'asset') {
        expect(layer.source.assetId).toBe(assetId);
      }
    }
  });

  it('rejects replacement file with incompatible media type', () => {
    const project = createTestProject();
    const assetId = 'asset-1111-2222'; // Video asset
    const incompatibleAudioPath = 'C:/Audio/voiceover.mp3';

    expect(isMediaTypeCompatible('video', incompatibleAudioPath)).toBe(false);

    const result = relinkSingleAsset(project, assetId, incompatibleAudioPath);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not compatible');
  });

  it('batch relinks missing assets from a specified directory', () => {
    const project = createTestProject();
    // Make asset missing
    const missingProj: Project = {
      ...project,
      assetRegistry: {
        'asset-1111-2222': {
          ...project.assetRegistry['asset-1111-2222'],
          originalPath: 'C:/OldDir/footage_4k.mp4',
          missingStatus: 'missing',
        },
      },
    };

    const targetDir = 'E:/RestoredMedia';
    const availableFiles = ['unrelated.txt', 'footage_4k.mp4', 'other_clip.mov'];

    const res = batchRelinkFromDirectory(missingProj, targetDir, availableFiles);
    expect(res.relinkedCount).toBe(1);
    expect(res.updatedProject.assetRegistry['asset-1111-2222'].relinkPath).toBe('E:/RestoredMedia/footage_4k.mp4');
    expect(res.updatedProject.assetRegistry['asset-1111-2222'].missingStatus).toBe('relinked');
  });
});

describe('Stage C: Autosave and Recovery Manager', () => {
  it('saves and restores recovery snapshots correctly', async () => {
    const project = createTestProject();

    const saveOk = await saveRecoverySnapshot(project);
    expect(saveOk).toBe(true);

    const snapshot = await getRecoverySnapshot();
    expect(snapshot).not.toBeNull();
    if (snapshot) {
      expect(snapshot.metadata.projectName).toBe(project.name);
      expect(snapshot.project.id).toBe(project.id);
    }

    await clearRecoverySnapshot();
    const cleared = await getRecoverySnapshot();
    expect(cleared).toBeNull();
  });

  it('debounces rapid edits and prevents overlapping autosave writes', async () => {
    let saveCount = 0;
    const project = createTestProject();

    const manager = new AutosaveManager(
      () => ({ project, isDirty: true }),
      (status) => {
        if (status === 'saved') saveCount++;
      },
      { debounceMs: 50, periodicIntervalMs: 10000 }
    );

    // Rapid successive notifications
    manager.notifyProjectChanged();
    manager.notifyProjectChanged();
    manager.notifyProjectChanged();

    // Wait past debounce time
    await new Promise(r => setTimeout(r, 80));

    expect(saveCount).toBe(1);
    manager.dispose();
  });
});

describe('Stage B & F: Store Save, Open, and Error Workflows', () => {
  it('updates project path and clears dirty flag only upon successful save', async () => {
    const { useProjectStore } = await import('../state/projectStore');
    const store = useProjectStore.getState();

    store.newProject('Test Unsaved');
    // Execute dummy command to set dirty flag
    store.execute('Touch project', draft => {
      (draft.metadata as Record<string, unknown>).touched = true;
      return { ok: true, value: undefined };
    });

    expect(useProjectStore.getState().flags.hasUnsavedChanges).toBe(true);

    // Save project in browser mode (Blob download)
    const res = await useProjectStore.getState().saveCurrentProject();
    expect(res.success).toBe(true);
    expect(useProjectStore.getState().flags.hasUnsavedChanges).toBe(false);
    expect(useProjectStore.getState().flags.autosaveStatus).toBe('saved');
    expect(useProjectStore.getState().project.projectFilePath).toBeDefined();
  });

  it('preserves dirty flag when save is cancelled', async () => {
    const { useProjectStore } = await import('../state/projectStore');
    const storageModule = await import('../project/storage/projectStorage');

    // Mock saveProject to simulate user cancellation
    const originalSave = storageModule.saveProject;
    vi.spyOn(storageModule, 'saveProject').mockResolvedValueOnce({
      success: false,
      cancelled: true,
    });

    const store = useProjectStore.getState();
    store.setFlags({ hasUnsavedChanges: true });

    const res = await store.saveCurrentProject();
    expect(res.cancelled).toBe(true);
    // Dirty flag MUST remain true!
    expect(useProjectStore.getState().flags.hasUnsavedChanges).toBe(true);

    vi.spyOn(storageModule, 'saveProject').mockImplementation(originalSave);
  });

  it('preserves dirty flag and sets error status when save fails', async () => {
    const { useProjectStore } = await import('../state/projectStore');
    const storageModule = await import('../project/storage/projectStorage');

    // Mock saveProject to simulate an I/O error
    vi.spyOn(storageModule, 'saveProject').mockResolvedValueOnce({
      success: false,
      error: 'Disk full / Permission denied',
    });

    const store = useProjectStore.getState();
    store.setFlags({ hasUnsavedChanges: true });

    const res = await store.saveCurrentProject();
    expect(res.success).toBe(false);
    expect(res.error).toBe('Disk full / Permission denied');

    // Dirty flag MUST be preserved!
    expect(useProjectStore.getState().flags.hasUnsavedChanges).toBe(true);
    expect(useProjectStore.getState().flags.autosaveStatus).toBe('error');
  });
});
