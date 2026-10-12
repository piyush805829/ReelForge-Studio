/**
 * ReelForge Studio — Project Schema Validation & Serialization (Zod)
 *
 * Implements strict runtime validation and deterministic JSON serialization
 * for ReelForge Studio project files (.rfproj / .json).
 *
 * Schema Version: 1
 */

import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from '../schema/types';

// ─── Primitives ───────────────────────────────────────────────────────────────

export const rationalSchema = z.object({
  numerator: z.number().int(),
  denominator: z.number().int().positive({ message: 'Rational denominator must be strictly positive' }),
});

export const canvasSizeSchema = z.object({
  width: z.number().int().positive({ message: 'Canvas width must be positive' }),
  height: z.number().int().positive({ message: 'Canvas height must be positive' }),
});

// ─── Keyframes & Transforms ───────────────────────────────────────────────────

export const bezierHandleSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const keyframeSchema = z.object({
  id: z.string().min(1, 'Keyframe ID must not be empty'),
  propertyPath: z.string().min(1, 'Keyframe propertyPath must not be empty'),
  time: z.number().int().min(0, 'Keyframe time must be non-negative ticks'),
  value: z.union([z.number(), z.string(), z.boolean()]),
  interpolationType: z.enum(['linear', 'step', 'bezier', 'hold']),
  inHandle: bezierHandleSchema.optional(),
  outHandle: bezierHandleSchema.optional(),
  enabled: z.boolean(),
});

export const keyframeTrackSchema = z.object({
  propertyPath: z.string().min(1),
  keyframes: z.array(keyframeSchema),
});

export const transformSchema = z.object({
  positionX: z.number(),
  positionY: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
  rotation: z.number(),
  anchorX: z.number(),
  anchorY: z.number(),
  opacity: z.number().min(0).max(1),
});

export const audioSettingsSchema = z.object({
  volume: z.number().min(0).max(2),
  mute: z.boolean(),
  fadeInTicks: z.number().int().min(0),
  fadeOutTicks: z.number().int().min(0),
  pan: z.number().min(-1).max(1),
  keyframeTracks: z.array(keyframeTrackSchema),
});

// ─── Masks & Effects ──────────────────────────────────────────────────────────

export const maskPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  inHandleX: z.number().optional(),
  inHandleY: z.number().optional(),
  outHandleX: z.number().optional(),
  outHandleY: z.number().optional(),
});

export const maskSchema = z.object({
  id: z.string().min(1),
  maskType: z.enum(['rectangle', 'ellipse', 'path']),
  points: z.array(maskPointSchema),
  feather: z.number().min(0),
  expansion: z.number(),
  inverted: z.boolean(),
  opacity: z.number().min(0).max(1),
  keyframeTracks: z.array(keyframeTrackSchema),
});

export const effectParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['number', 'color', 'boolean', 'select', 'point2d']),
  value: z.union([z.number(), z.string(), z.boolean(), z.object({ x: z.number(), y: z.number() })]),
  defaultValue: z.union([z.number(), z.string(), z.boolean(), z.object({ x: z.number(), y: z.number() })]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  keyframeTrack: keyframeTrackSchema.optional(),
});

export const effectSchema = z.object({
  id: z.string().min(1),
  effectType: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  parameters: z.record(z.string(), effectParameterSchema),
});

// ─── Sources ──────────────────────────────────────────────────────────────────

export const textSourceSchema = z.object({
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.number().min(100).max(900),
  fontStyle: z.enum(['normal', 'italic']),
  color: z.string(),
  alignment: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  shadowColor: z.string().optional(),
  shadowX: z.number().optional(),
  shadowY: z.number().optional(),
  shadowBlur: z.number().optional(),
});

export const shapeSourceSchema = z.object({
  shapeType: z.enum(['rectangle', 'ellipse', 'line', 'polygon']),
  width: z.number().positive(),
  height: z.number().positive(),
  fillColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  cornerRadius: z.number().optional(),
  sides: z.number().int().min(3).optional(),
});

export const solidSourceSchema = z.object({
  color: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const layerSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset'), assetId: z.string().min(1) }),
  z.object({ kind: z.literal('composition'), compositionId: z.string().min(1) }),
  z.object({ kind: z.literal('text'), text: textSourceSchema }),
  z.object({ kind: z.literal('shape'), shape: shapeSourceSchema }),
  z.object({ kind: z.literal('solid'), solid: solidSourceSchema }),
]);

// ─── Layer ────────────────────────────────────────────────────────────────────

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layerType: z.enum(['video', 'audio', 'image', 'text', 'shape', 'nested-composition', 'solid']),
  enabled: z.boolean(),
  locked: z.boolean(),
  visible: z.boolean(),
  blendMode: z.enum([
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'add'
  ]),
  parentLayerId: z.string().optional(),
  source: layerSourceSchema,
  sourceInSeconds: z.number().min(0, { message: 'sourceInSeconds must be non-negative' }),
  sourceOutSeconds: z.number().min(0, { message: 'sourceOutSeconds must be non-negative' }),
  timelineStartTicks: z.number().int().min(0, { message: 'timelineStartTicks must be non-negative ticks' }),
  timelineDurationTicks: z.number().int().positive({ message: 'timelineDurationTicks must be strictly positive ticks' }),
  speed: z.number().positive({ message: 'speed must be strictly positive' }),
  transform: transformSchema,
  fitMode: z.enum(['contain', 'cover', 'fill', 'none']),
  keyframeTracks: z.array(keyframeTrackSchema),
  effects: z.array(effectSchema),
  masks: z.array(maskSchema),
  audioSettings: audioSettingsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()),
}).refine(l => l.sourceOutSeconds >= l.sourceInSeconds, {
  message: 'sourceOutSeconds must be greater than or equal to sourceInSeconds',
  path: ['sourceOutSeconds'],
});

// ─── Composition ──────────────────────────────────────────────────────────────

export const compositionMarkerSchema = z.object({
  id: z.string().min(1),
  timeTicks: z.number().int().min(0),
  label: z.string(),
  color: z.string(),
});

export const compositionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: rationalSchema,
  durationTicks: z.number().int().min(0),
  background: z.string(),
  orderedLayerIds: z.array(z.string()),
  layers: z.record(z.string(), layerSchema),
  markers: z.array(compositionMarkerSchema),
  metadata: z.record(z.string(), z.unknown()),
});

// ─── Media Asset ─────────────────────────────────────────────────────────────

export const videoStreamMetadataSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  frameRate: rationalSchema,
  codec: z.string(),
  pixelFormat: z.string().optional(),
  bitrate: z.number().optional(),
  duration: z.number().min(0),
});

export const audioStreamMetadataSchema = z.object({
  sampleRate: z.number().positive(),
  channels: z.number().int().positive(),
  codec: z.string(),
  bitrate: z.number().optional(),
  duration: z.number().min(0),
});

export const thumbnailReferenceSchema = z.object({
  atTimeSeconds: z.number().min(0),
  cachePath: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  mediaType: z.enum(['video', 'audio', 'image']),
  originalPath: z.string().min(1),
  relinkPath: z.string().optional(),
  name: z.string().min(1),
  duration: z.number().min(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  frameRate: rationalSchema.optional(),
  pixelAspectRatio: z.number().positive(),
  videoStream: videoStreamMetadataSchema.optional(),
  audioStream: audioStreamMetadataSchema.optional(),
  thumbnails: z.array(thumbnailReferenceSchema),
  missingStatus: z.enum(['present', 'missing', 'relinked', 'offline']),
  importedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

// ─── Export Settings ──────────────────────────────────────────────────────────

export const exportSettingsSchema = z.object({
  container: z.enum(['mp4', 'mov', 'mkv', 'webm']),
  videoCodec: z.enum(['h264', 'h265', 'vp9', 'av1', 'prores']),
  audioCodec: z.enum(['aac', 'mp3', 'opus', 'flac', 'pcm_s16le']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: rationalSchema,
  videoBitrate: z.number().positive().optional(),
  audioBitrate: z.number().positive().optional(),
  audioSampleRate: z.number().int().positive(),
  preset: z.string().optional(),
});

// ─── Root Project Schema ──────────────────────────────────────────────────────

export const projectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION, {
    errorMap: () => ({ message: `Unsupported schema version. Expected ${CURRENT_SCHEMA_VERSION}` }),
  }),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  projectFilePath: z.string().optional(),
  compositionRegistry: z.record(z.string(), compositionSchema),
  mainCompositionId: z.string().min(1),
  assetRegistry: z.record(z.string(), mediaAssetSchema),
  defaultFrameRate: rationalSchema,
  defaultCanvas: canvasSizeSchema,
  exportDefaults: exportSettingsSchema,
  metadata: z.record(z.string(), z.unknown()),
}).superRefine((data, ctx) => {
  // 1. Verify mainCompositionId exists
  if (!data.compositionRegistry[data.mainCompositionId]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `mainCompositionId "${data.mainCompositionId}" not found in compositionRegistry`,
      path: ['mainCompositionId'],
    });
  }

  // 2. Validate layers in each composition
  for (const [compId, comp] of Object.entries(data.compositionRegistry)) {
    // Check that orderedLayerIds matches keys in comp.layers
    const layerKeys = new Set(Object.keys(comp.layers));
    for (const layerId of comp.orderedLayerIds) {
      if (!layerKeys.has(layerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `orderedLayerIds references layer "${layerId}" not found in comp "${compId}".layers`,
          path: ['compositionRegistry', compId, 'orderedLayerIds'],
        });
      }
    }

    for (const [layerId, layer] of Object.entries(comp.layers)) {
      // Asset reference integrity
      if (layer.source.kind === 'asset') {
        if (!data.assetRegistry[layer.source.assetId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Layer "${layerId}" references asset "${layer.source.assetId}" not found in assetRegistry`,
            path: ['compositionRegistry', compId, 'layers', layerId, 'source', 'assetId'],
          });
        }
      }

      // Nested composition reference integrity
      if (layer.source.kind === 'composition') {
        const nestedId = layer.source.compositionId;
        if (!data.compositionRegistry[nestedId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Layer "${layerId}" references composition "${nestedId}" not found in compositionRegistry`,
            path: ['compositionRegistry', compId, 'layers', layerId, 'source', 'compositionId'],
          });
        } else if (nestedId === compId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Composition "${compId}" nests itself in layer "${layerId}"`,
            path: ['compositionRegistry', compId, 'layers', layerId, 'source', 'compositionId'],
          });
        }
      }
    }
  }

  // 3. Detect circular composition cycles across the graph
  function hasCycle(currentId: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    visited.add(currentId);
    recursionStack.add(currentId);

    const comp = data.compositionRegistry[currentId];
    if (comp) {
      for (const layer of Object.values(comp.layers)) {
        if (layer.source.kind === 'composition') {
          const childId = layer.source.compositionId;
          if (!visited.has(childId) && hasCycle(childId, visited, recursionStack)) {
            return true;
          } else if (recursionStack.has(childId)) {
            return true;
          }
        }
      }
    }

    recursionStack.delete(currentId);
    return false;
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  for (const compId of Object.keys(data.compositionRegistry)) {
    if (!visited.has(compId)) {
      if (hasCycle(compId, visited, recursionStack)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Circular composition nesting cycle detected starting from composition "${compId}"`,
          path: ['compositionRegistry', compId],
        });
        break;
      }
    }
  }
});
