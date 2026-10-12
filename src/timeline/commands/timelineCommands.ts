/**
 * ReelForge Studio — Timeline Command System
 *
 * Commands are the ONLY way to modify the project model.
 * Each command:
 *   1. Validates its inputs
 *   2. Produces a predictable state transition
 *   3. Is fully reversible (undo/redo)
 *   4. Reports useful errors
 *   5. Is testable without the UI
 *
 * Commands work against a ProjectDraft (Immer draft) and are
 * dispatched through the command history layer.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Project,
  Composition,
  Layer,
  MediaAsset,
  StableId,
  Ticks,
} from '../../project/schema/types';
import {
  assertNonNegativeTicks,
  secondsToTicks,
} from '../time/timeConversions';

// ─── Command Result ───────────────────────────────────────────────────────────

export interface CommandSuccess<T = void> {
  readonly ok: true;
  readonly value: T;
}
export interface CommandFailure {
  readonly ok: false;
  readonly error: string;
}
export type CommandResult<T = void> = CommandSuccess<T> | CommandFailure;

function ok<T>(value: T): CommandSuccess<T> { return { ok: true, value }; }
function fail(error: string): CommandFailure { return { ok: false, error }; }

// ─── Mutable Draft Type ───────────────────────────────────────────────────────

/** Deeply mutable version of Project used inside Immer produce() calls */
export type ProjectDraft = {
  -readonly [K in keyof Project]: Project[K] extends ReadonlyArray<infer E>
    ? E[]
    : Project[K] extends Readonly<Record<string, infer V>>
    ? Record<string, V>
    : Project[K];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getComp(project: Project, compId: StableId): Composition | undefined {
  return project.compositionRegistry[compId];
}

function requireComp(project: Project, compId: StableId): CommandResult<Composition> {
  const comp = getComp(project, compId);
  if (!comp) return fail(`Composition "${compId}" not found`);
  return ok(comp);
}

function requireLayer(comp: Composition, layerId: StableId): CommandResult<Layer> {
  const layer = comp.layers[layerId];
  if (!layer) return fail(`Layer "${layerId}" not found in composition "${comp.id}"`);
  return ok(layer);
}

function requireAsset(project: Project, assetId: StableId): CommandResult<MediaAsset> {
  const asset = project.assetRegistry[assetId];
  if (!asset) return fail(`Asset "${assetId}" not found in asset registry`);
  return ok(asset);
}

/** Detect circular composition nesting */
function wouldCreateCircularRef(
  project: Project,
  targetCompId: StableId,
  nestedCompId: StableId,
  visited = new Set<StableId>(),
): boolean {
  if (nestedCompId === targetCompId) return true;
  if (visited.has(nestedCompId)) return true;
  visited.add(nestedCompId);
  const comp = project.compositionRegistry[nestedCompId];
  if (!comp) return false;
  for (const layer of Object.values(comp.layers)) {
    if (layer.source.kind === 'composition') {
      if (wouldCreateCircularRef(project, targetCompId, layer.source.compositionId, visited)) {
        return true;
      }
    }
  }
  return false;
}

// ─── Command: ImportAsset ─────────────────────────────────────────────────────

export interface ImportAssetArgs {
  asset: MediaAsset;
}

export function cmdImportAsset(
  draft: ProjectDraft,
  args: ImportAssetArgs,
): CommandResult<StableId> {
  const { asset } = args;
  if (!asset.id) return fail('Asset must have an ID');
  if (draft.assetRegistry[asset.id]) return fail(`Asset "${asset.id}" already exists`);
  if (!asset.originalPath) return fail('Asset must have an original path');
  (draft.assetRegistry as Record<string, MediaAsset>)[asset.id] = asset;
  draft.updatedAt = new Date().toISOString();
  return ok(asset.id);
}

// ─── Command: AddLayer ────────────────────────────────────────────────────────

export interface AddLayerArgs {
  compositionId: StableId;
  layer: Layer;
  /** Insert at this index in orderedLayerIds (default: end / top) */
  insertAtIndex?: number;
}

export function cmdAddLayer(
  draft: ProjectDraft,
  args: AddLayerArgs,
): CommandResult<StableId> {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const { layer } = args;

  if (layer.timelineDurationTicks <= 0) {
    return fail(`Layer "${layer.id}" has non-positive duration: ${layer.timelineDurationTicks}`);
  }
  assertNonNegativeTicks(layer.timelineStartTicks, 'AddLayer.timelineStartTicks');

  // Validate asset/composition references
  if (layer.source.kind === 'asset') {
    const assetResult = requireAsset(draft as unknown as Project, layer.source.assetId);
    if (!assetResult.ok) return assetResult;
  }
  if (layer.source.kind === 'composition') {
    const nestedId = layer.source.compositionId;
    if (!(draft.compositionRegistry as Record<string, unknown>)[nestedId]) {
      return fail(`Nested composition "${nestedId}" not found`);
    }
    if (wouldCreateCircularRef(draft as unknown as Project, args.compositionId, nestedId)) {
      return fail(`Adding composition "${nestedId}" would create a circular reference`);
    }
  }

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const mutableLayers = comp.layers as Record<string, Layer>;
  mutableLayers[layer.id] = layer;

  const mutableLayerIds = comp.orderedLayerIds as string[];
  const idx = args.insertAtIndex ?? mutableLayerIds.length;
  mutableLayerIds.splice(idx, 0, layer.id);

  draft.updatedAt = new Date().toISOString();
  return ok(layer.id);
}

// ─── Command: DeleteLayer ─────────────────────────────────────────────────────

export interface DeleteLayerArgs {
  compositionId: StableId;
  layerId: StableId;
}

export function cmdDeleteLayer(
  draft: ProjectDraft,
  args: DeleteLayerArgs,
): CommandResult {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const mutableLayers = comp.layers as Record<string, Layer>;
  delete mutableLayers[args.layerId];

  const mutableLayerIds = comp.orderedLayerIds as string[];
  const idx = mutableLayerIds.indexOf(args.layerId);
  if (idx !== -1) mutableLayerIds.splice(idx, 1);

  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: MoveLayer ────────────────────────────────────────────────────────

export interface MoveLayerArgs {
  compositionId: StableId;
  layerId: StableId;
  newTimelineStartTicks: Ticks;
}

export function cmdMoveLayer(
  draft: ProjectDraft,
  args: MoveLayerArgs,
): CommandResult {
  assertNonNegativeTicks(args.newTimelineStartTicks, 'MoveLayer.newTimelineStartTicks');
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];
  // Create a new layer object with updated start — source in/out are PRESERVED
  (comp.layers as Record<string, Layer>)[args.layerId] = {
    ...layer,
    timelineStartTicks: args.newTimelineStartTicks,
  };
  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: TrimLayerStart ──────────────────────────────────────────────────

export interface TrimLayerStartArgs {
  compositionId: StableId;
  layerId: StableId;
  /** New timeline start (must be ≥ original start and < end) */
  newTimelineStartTicks: Ticks;
}

export function cmdTrimLayerStart(
  draft: ProjectDraft,
  args: TrimLayerStartArgs,
): CommandResult {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];

  const originalEnd = layer.timelineStartTicks + layer.timelineDurationTicks;
  if (args.newTimelineStartTicks >= originalEnd) {
    return fail(`TrimLayerStart: new start (${args.newTimelineStartTicks}) must be < end (${originalEnd})`);
  }

  const delta = args.newTimelineStartTicks - layer.timelineStartTicks;
  const newDuration = layer.timelineDurationTicks - delta;
  if (newDuration <= 0) return fail('TrimLayerStart: would produce zero or negative duration');

  // Adjust sourceIn proportionally to speed
  const sourceInDeltaSeconds = (delta / 240_000) * layer.speed;
  const newSourceIn = layer.sourceInSeconds + sourceInDeltaSeconds;
  if (newSourceIn < -1e-6) {
    return fail(`TrimLayerStart: new source in (${newSourceIn.toFixed(3)}s) cannot be negative`);
  }

  if (layer.source.kind === 'asset') {
    const asset = draft.assetRegistry[layer.source.assetId];
    if (asset && asset.duration > 0 && newSourceIn >= asset.duration) {
      return fail(`TrimLayerStart: new source in exceeds media duration (${asset.duration}s)`);
    }
  }

  (comp.layers as Record<string, Layer>)[args.layerId] = {
    ...layer,
    timelineStartTicks:    args.newTimelineStartTicks,
    timelineDurationTicks: newDuration,
    sourceInSeconds:       Math.max(0, newSourceIn),
  };
  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: TrimLayerEnd ────────────────────────────────────────────────────

export interface TrimLayerEndArgs {
  compositionId: StableId;
  layerId: StableId;
  /** New timeline end tick (exclusive) — must be > start */
  newTimelineEndTicks: Ticks;
}

export function cmdTrimLayerEnd(
  draft: ProjectDraft,
  args: TrimLayerEndArgs,
): CommandResult {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];

  if (args.newTimelineEndTicks <= layer.timelineStartTicks) {
    return fail(`TrimLayerEnd: new end must be > start (${layer.timelineStartTicks})`);
  }

  const newDuration = args.newTimelineEndTicks - layer.timelineStartTicks;
  const sourceOutDelta = ((newDuration - layer.timelineDurationTicks) / 240_000) * layer.speed;
  const newSourceOut = layer.sourceOutSeconds + sourceOutDelta;

  if (layer.source.kind === 'asset') {
    const asset = draft.assetRegistry[layer.source.assetId];
    if (asset && asset.duration > 0 && newSourceOut > asset.duration + 1e-4) {
      return fail(`TrimLayerEnd: new source out (${newSourceOut.toFixed(3)}s) exceeds media duration (${asset.duration}s)`);
    }
  }

  (comp.layers as Record<string, Layer>)[args.layerId] = {
    ...layer,
    timelineDurationTicks: newDuration,
    sourceOutSeconds:      newSourceOut,
  };
  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: SplitLayer ─────────────────────────────────────────────────────

export interface SplitLayerArgs {
  compositionId: StableId;
  layerId: StableId;
  /** Split point in composition timeline ticks */
  splitTimeTicks: Ticks;
}

export interface SplitLayerResult {
  leftLayerId: StableId;
  rightLayerId: StableId;
}

export function cmdSplitLayer(
  draft: ProjectDraft,
  args: SplitLayerArgs,
): CommandResult<SplitLayerResult> {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];

  const layerEnd = layer.timelineStartTicks + layer.timelineDurationTicks;
  if (args.splitTimeTicks <= layer.timelineStartTicks || args.splitTimeTicks >= layerEnd) {
    return fail(
      `SplitLayer: split point ${args.splitTimeTicks} is outside layer bounds ` +
      `[${layer.timelineStartTicks}, ${layerEnd}]`
    );
  }

  const leftDuration  = args.splitTimeTicks - layer.timelineStartTicks;
  const rightDuration = layerEnd - args.splitTimeTicks;

  // Adjust source out for left, source in for right
  const leftSourceOutDelta  = (leftDuration / 240_000) * layer.speed;
  const rightSourceInDelta  = (leftDuration / 240_000) * layer.speed;

  // Deterministically partition keyframe tracks across split point
  const leftKeyframeTracks = layer.keyframeTracks?.map(kt => ({
    ...kt,
    keyframes: kt.keyframes.filter(kf => kf.time <= args.splitTimeTicks),
  })) ?? [];

  const rightKeyframeTracks = layer.keyframeTracks?.map(kt => ({
    ...kt,
    keyframes: kt.keyframes.filter(kf => kf.time >= args.splitTimeTicks),
  })) ?? [];

  const leftLayer: Layer = {
    ...layer,
    id:                    uuidv4(),
    timelineDurationTicks: leftDuration,
    sourceOutSeconds:      layer.sourceInSeconds + leftSourceOutDelta,
    keyframeTracks:        leftKeyframeTracks,
  };

  const rightLayer: Layer = {
    ...layer,
    id:                    uuidv4(),
    timelineStartTicks:    args.splitTimeTicks,
    timelineDurationTicks: rightDuration,
    sourceInSeconds:       layer.sourceInSeconds + rightSourceInDelta,
    keyframeTracks:        rightKeyframeTracks,
  };

  // Replace original layer with left, insert right after it
  const mutableLayers = comp.layers as Record<string, Layer>;
  const mutableIds = comp.orderedLayerIds as string[];
  const originalIdx = mutableIds.indexOf(args.layerId);

  delete mutableLayers[args.layerId];
  mutableIds.splice(originalIdx, 1, leftLayer.id, rightLayer.id);
  mutableLayers[leftLayer.id]  = leftLayer;
  mutableLayers[rightLayer.id] = rightLayer;

  draft.updatedAt = new Date().toISOString();
  return ok({ leftLayerId: leftLayer.id, rightLayerId: rightLayer.id });
}

// ─── Command: DuplicateLayer ──────────────────────────────────────────────────

export interface DuplicateLayerArgs {
  compositionId: StableId;
  layerId: StableId;
  /** Offset in ticks for the duplicate (default: place immediately after original) */
  offsetTicks?: Ticks;
}

export function cmdDuplicateLayer(
  draft: ProjectDraft,
  args: DuplicateLayerArgs,
): CommandResult<StableId> {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];

  const offset = args.offsetTicks ?? layer.timelineDurationTicks;
  const newLayer: Layer = {
    ...layer,
    id:                 uuidv4(),
    name:               `${layer.name} (copy)`,
    timelineStartTicks: layer.timelineStartTicks + offset,
  };

  const mutableLayers = comp.layers as Record<string, Layer>;
  const mutableIds = comp.orderedLayerIds as string[];
  const originalIdx = mutableIds.indexOf(args.layerId);

  mutableLayers[newLayer.id] = newLayer;
  mutableIds.splice(originalIdx + 1, 0, newLayer.id);

  draft.updatedAt = new Date().toISOString();
  return ok(newLayer.id);
}

// ─── Command: ReorderLayer ────────────────────────────────────────────────────

export interface ReorderLayerArgs {
  compositionId: StableId;
  layerId: StableId;
  newIndex: number;
}

export function cmdReorderLayer(
  draft: ProjectDraft,
  args: ReorderLayerArgs,
): CommandResult {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const mutableIds = comp.orderedLayerIds as string[];
  const currentIdx = mutableIds.indexOf(args.layerId);
  if (currentIdx === -1) return fail(`Layer "${args.layerId}" not in orderedLayerIds`);

  mutableIds.splice(currentIdx, 1);
  const clampedIdx = Math.max(0, Math.min(args.newIndex, mutableIds.length));
  mutableIds.splice(clampedIdx, 0, args.layerId);

  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: SetLayerProperty ────────────────────────────────────────────────

export interface SetLayerPropertyArgs {
  compositionId: StableId;
  layerId: StableId;
  property: keyof Layer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export function cmdSetLayerProperty(
  draft: ProjectDraft,
  args: SetLayerPropertyArgs,
): CommandResult {
  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];
  (comp.layers as Record<string, Layer>)[args.layerId] = {
    ...layer,
    [args.property]: args.value,
  };
  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: SetClipSpeed ────────────────────────────────────────────────────

export interface SetClipSpeedArgs {
  compositionId: StableId;
  layerId: StableId;
  /** Speed multiplier: 1.0 = normal, 2.0 = 2x, 0.5 = half speed */
  speed: number;
}

export function cmdSetClipSpeed(
  draft: ProjectDraft,
  args: SetClipSpeedArgs,
): CommandResult {
  if (args.speed <= 0) return fail(`Speed must be > 0, got ${args.speed}`);
  if (args.speed > 100) return fail(`Speed must be ≤ 100, got ${args.speed}`);

  const compResult = requireComp(draft as unknown as Project, args.compositionId);
  if (!compResult.ok) return compResult;
  const layerResult = requireLayer(compResult.value, args.layerId);
  if (!layerResult.ok) return layerResult;

  const comp = (draft.compositionRegistry as Record<string, Composition>)[args.compositionId];
  const layer = (comp.layers as Record<string, Layer>)[args.layerId];

  // Recalculate timeline duration based on new speed
  const sourceDuration = layer.sourceOutSeconds - layer.sourceInSeconds;
  const newTimelineDuration = secondsToTicks(sourceDuration / args.speed);
  if (newTimelineDuration <= 0) return fail('SetClipSpeed would produce zero-length clip');

  (comp.layers as Record<string, Layer>)[args.layerId] = {
    ...layer,
    speed:                 args.speed,
    timelineDurationTicks: newTimelineDuration,
  };
  draft.updatedAt = new Date().toISOString();
  return ok(undefined);
}

// ─── Command: CreateComposition ──────────────────────────────────────────────

export interface CreateCompositionArgs {
  composition: Composition;
}

export function cmdCreateComposition(
  draft: ProjectDraft,
  args: CreateCompositionArgs,
): CommandResult<StableId> {
  const { composition } = args;
  if ((draft.compositionRegistry as Record<string, unknown>)[composition.id]) {
    return fail(`Composition "${composition.id}" already exists`);
  }
  if (composition.width <= 0 || composition.height <= 0) {
    return fail('Composition must have positive dimensions');
  }
  if (composition.frameRate.numerator <= 0 || composition.frameRate.denominator <= 0) {
    return fail('Composition must have a valid frame rate');
  }
  (draft.compositionRegistry as Record<string, Composition>)[composition.id] = composition;
  draft.updatedAt = new Date().toISOString();
  return ok(composition.id);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const TimelineCommands = {
  importAsset:        cmdImportAsset,
  addLayer:           cmdAddLayer,
  deleteLayer:        cmdDeleteLayer,
  moveLayer:          cmdMoveLayer,
  trimLayerStart:     cmdTrimLayerStart,
  trimLayerEnd:       cmdTrimLayerEnd,
  splitLayer:         cmdSplitLayer,
  duplicateLayer:     cmdDuplicateLayer,
  reorderLayer:       cmdReorderLayer,
  setLayerProperty:   cmdSetLayerProperty,
  setClipSpeed:       cmdSetClipSpeed,
  createComposition:  cmdCreateComposition,
} as const;

export type TimelineCommandName = keyof typeof TimelineCommands;
