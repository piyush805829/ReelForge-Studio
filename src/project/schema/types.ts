/**
 * ReelForge Studio — Core Project Schema
 *
 * This file defines all TypeScript types for the project data model.
 * It is the single source of truth for project structure.
 *
 * Time model:
 *   - Timeline ticks: integer, 240,000 per second
 *   - 30fps frame = 8,000 ticks
 *   - 23.976fps frame ≈ 10,010.01 ticks (use rational arithmetic for exact values)
 *   - Pixel coordinates are NEVER stored in the project model
 *
 * All identifiers are stable UUIDs. All references must be validated before use.
 *
 * Schema version: 1
 */

// ─── Primitive Types ──────────────────────────────────────────────────────────

/** Unique stable identifier (UUID v4 string) */
export type StableId = string;

/** Timeline position in ticks (integer, 240,000 ticks/second) */
export type Ticks = number;

/** Rational number representation (for frame rates, timebases) */
export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

/** Canvas dimensions in pixels */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

// ─── Timebase Constants ────────────────────────────────────────────────────────

/** Ticks per second for the ReelForge project timebase */
export const PROJECT_TIMEBASE = 240_000 as const;

/** Standard frame rates as Rational values */
export const FRAME_RATES = {
  FPS_24:     { numerator: 24,    denominator: 1    } as Rational,
  FPS_23976:  { numerator: 24000, denominator: 1001 } as Rational,
  FPS_25:     { numerator: 25,    denominator: 1    } as Rational,
  FPS_29970:  { numerator: 30000, denominator: 1001 } as Rational,
  FPS_30:     { numerator: 30,    denominator: 1    } as Rational,
  FPS_48:     { numerator: 48,    denominator: 1    } as Rational,
  FPS_50:     { numerator: 50,    denominator: 1    } as Rational,
  FPS_60:     { numerator: 60,    denominator: 1    } as Rational,
} as const;

// ─── Layer Types ──────────────────────────────────────────────────────────────

export type LayerType =
  | 'video'
  | 'audio'
  | 'image'
  | 'text'
  | 'shape'
  | 'nested-composition'
  | 'solid';

// ─── Blend Modes ─────────────────────────────────────────────────────────────

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'add';

// ─── Keyframe Interpolation ───────────────────────────────────────────────────

export type InterpolationType = 'linear' | 'step' | 'bezier' | 'hold';

/** Bézier handle as normalized [x, y] relative to keyframe anchor */
export interface BezierHandle {
  readonly x: number;
  readonly y: number;
}

export interface Keyframe {
  readonly id: StableId;
  /** Dot-separated path to the property, e.g. "transform.positionX" */
  readonly propertyPath: string;
  /** Position in composition-local ticks */
  readonly time: Ticks;
  readonly value: number | string | boolean;
  readonly interpolationType: InterpolationType;
  readonly inHandle?: BezierHandle;
  readonly outHandle?: BezierHandle;
  readonly enabled: boolean;
}

export interface KeyframeTrack {
  readonly propertyPath: string;
  readonly keyframes: ReadonlyArray<Keyframe>;
}

// ─── Transform ────────────────────────────────────────────────────────────────

export interface Transform {
  readonly positionX: number;   // pixels from composition center
  readonly positionY: number;   // pixels from composition center
  readonly scaleX: number;      // 1.0 = 100%
  readonly scaleY: number;      // 1.0 = 100%
  readonly rotation: number;    // degrees, clockwise
  readonly anchorX: number;     // pixels from layer origin
  readonly anchorY: number;     // pixels from layer origin
  readonly opacity: number;     // 0.0–1.0
}

export const DEFAULT_TRANSFORM: Transform = {
  positionX: 0,
  positionY: 0,
  scaleX:    1,
  scaleY:    1,
  rotation:  0,
  anchorX:   0,
  anchorY:   0,
  opacity:   1,
} as const;

// ─── Fit Mode ─────────────────────────────────────────────────────────────────

export type FitMode = 'contain' | 'cover' | 'fill' | 'none';

// ─── Audio Settings ───────────────────────────────────────────────────────────

export interface AudioSettings {
  readonly volume: number;           // 0.0–2.0 (1.0 = unity gain)
  readonly mute: boolean;
  readonly fadeInTicks: Ticks;       // duration of fade-in (0 = no fade)
  readonly fadeOutTicks: Ticks;      // duration of fade-out (0 = no fade)
  readonly pan: number;              // -1.0 (L) to 1.0 (R), 0 = center
  readonly keyframeTracks: ReadonlyArray<KeyframeTrack>;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  volume:         1.0,
  mute:           false,
  fadeInTicks:    0,
  fadeOutTicks:   0,
  pan:            0,
  keyframeTracks: [],
} as const;

// ─── Effects ──────────────────────────────────────────────────────────────────

export interface EffectParameter {
  readonly name: string;
  readonly value: number | string | boolean;
}

export interface Effect {
  readonly id: StableId;
  readonly effectType: string;
  readonly enabled: boolean;
  readonly parameters: ReadonlyArray<EffectParameter>;
  readonly effectVersion: number;
  readonly keyframeTracks: ReadonlyArray<KeyframeTrack>;
}

// ─── Masks ────────────────────────────────────────────────────────────────────

export type MaskType = 'rectangle' | 'ellipse' | 'path';

export interface MaskPoint {
  readonly x: number;
  readonly y: number;
}

export interface Mask {
  readonly id: StableId;
  readonly maskType: MaskType;
  readonly points: ReadonlyArray<MaskPoint>;  // empty for rectangle/ellipse
  readonly feather: number;                   // pixels
  readonly expansion: number;                 // pixels
  readonly inverted: boolean;
  readonly opacity: number;                   // 0.0–1.0
  readonly keyframeTracks: ReadonlyArray<KeyframeTrack>;
}

// ─── Text Layer Source ────────────────────────────────────────────────────────

export interface TextSource {
  readonly content: string;
  readonly fontFamily: string;
  readonly fontSize: number;       // points
  readonly fontWeight: number;     // 100–900
  readonly fontStyle: 'normal' | 'italic';
  readonly color: string;          // hex or rgba
  readonly alignment: 'left' | 'center' | 'right';
  readonly lineHeight: number;     // multiplier
  readonly letterSpacing: number;  // em
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly shadowColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
}

// ─── Shape Layer Source ───────────────────────────────────────────────────────

export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon';

export interface ShapeSource {
  readonly shapeType: ShapeType;
  readonly width: number;
  readonly height: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly cornerRadius?: number;   // for rectangles
  readonly sides?: number;          // for polygons
}

// ─── Solid Layer Source ───────────────────────────────────────────────────────

export interface SolidSource {
  readonly color: string;  // hex or rgba
  readonly width: number;
  readonly height: number;
}

// ─── Layer Source Reference ───────────────────────────────────────────────────

export type LayerSource =
  | { readonly kind: 'asset';        readonly assetId: StableId }
  | { readonly kind: 'composition';  readonly compositionId: StableId }
  | { readonly kind: 'text';         readonly text: TextSource }
  | { readonly kind: 'shape';        readonly shape: ShapeSource }
  | { readonly kind: 'solid';        readonly solid: SolidSource };

// ─── Layer ────────────────────────────────────────────────────────────────────

export interface Layer {
  readonly id: StableId;
  readonly name: string;
  readonly layerType: LayerType;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly visible: boolean;
  readonly blendMode: BlendMode;
  readonly parentLayerId?: StableId;   // null = no parent
  readonly source: LayerSource;

  /**
   * Source media in-point (in seconds, rational).
   * For non-asset layers, this is always 0.
   */
  readonly sourceInSeconds: number;
  /**
   * Source media out-point (in seconds, rational).
   * sourceOut - sourceIn = played duration.
   */
  readonly sourceOutSeconds: number;

  /** Position of this layer's first frame in the composition timeline (ticks) */
  readonly timelineStartTicks: Ticks;
  /** Duration of this layer on the timeline (ticks) */
  readonly timelineDurationTicks: Ticks;

  /** Playback speed multiplier (1.0 = normal, 2.0 = 2x, 0.5 = half) */
  readonly speed: number;

  readonly transform: Transform;
  readonly fitMode: FitMode;

  readonly keyframeTracks: ReadonlyArray<KeyframeTrack>;
  readonly effects: ReadonlyArray<Effect>;
  readonly masks: ReadonlyArray<Mask>;

  /** Null for non-audio/non-video layers */
  readonly audioSettings?: AudioSettings;

  readonly metadata: Record<string, unknown>;
}

// ─── Composition ──────────────────────────────────────────────────────────────

export interface Composition {
  readonly id: StableId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frameRate: Rational;
  /** Total composition duration in ticks */
  readonly durationTicks: Ticks;
  readonly background: string;   // hex or 'transparent'
  /** Ordered layer IDs (bottom to top in z-order) */
  readonly orderedLayerIds: ReadonlyArray<StableId>;
  /** Layer definitions keyed by ID */
  readonly layers: Readonly<Record<StableId, Layer>>;
  readonly markers: ReadonlyArray<CompositionMarker>;
  readonly metadata: Record<string, unknown>;
}

export interface CompositionMarker {
  readonly id: StableId;
  readonly timeTicks: Ticks;
  readonly label: string;
  readonly color: string;
}

// ─── Media Asset ─────────────────────────────────────────────────────────────

export type MediaType = 'video' | 'audio' | 'image';
export type MissingMediaStatus = 'present' | 'missing' | 'relinked' | 'offline';

export interface VideoStreamMetadata {
  readonly width: number;
  readonly height: number;
  readonly frameRate: Rational;
  readonly codec: string;
  readonly pixelFormat?: string;
  readonly bitrate?: number;
  readonly duration: number;   // seconds
}

export interface AudioStreamMetadata {
  readonly sampleRate: number;
  readonly channels: number;
  readonly codec: string;
  readonly bitrate?: number;
  readonly duration: number;   // seconds
}

export interface ThumbnailReference {
  readonly atTimeSeconds: number;
  readonly cachePath: string;    // absolute path to cached thumbnail file
  readonly width: number;
  readonly height: number;
}

export interface MediaAsset {
  readonly id: StableId;
  readonly mediaType: MediaType;
  readonly originalPath: string;    // absolute path at import time
  readonly relinkPath?: string;     // updated path after relinking
  readonly name: string;            // display name (usually filename)
  readonly duration: number;        // seconds (0 for images)
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: Rational;
  readonly pixelAspectRatio: number;  // 1.0 = square pixels
  readonly videoStream?: VideoStreamMetadata;
  readonly audioStream?: AudioStreamMetadata;
  readonly thumbnails: ReadonlyArray<ThumbnailReference>;
  readonly proxyPath?: string;
  readonly checksum?: string;
  readonly missingStatus: MissingMediaStatus;
  readonly importedAt: string;   // ISO 8601 timestamp
  readonly metadata: Record<string, unknown>;
}

// ─── Export Settings ──────────────────────────────────────────────────────────

export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1' | 'prores';
export type AudioCodec = 'aac' | 'mp3' | 'opus' | 'flac' | 'pcm_s16le';

export interface ExportSettings {
  readonly container: VideoContainer;
  readonly videoCodec: VideoCodec;
  readonly audioCodec: AudioCodec;
  readonly width: number;
  readonly height: number;
  readonly frameRate: Rational;
  readonly videoBitrate?: number;   // kbps, undefined = auto
  readonly audioBitrate?: number;   // kbps, undefined = auto
  readonly audioSampleRate: number; // Hz
  readonly preset?: string;         // e.g. "instagram-reels", "youtube-1080p"
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  container:       'mp4',
  videoCodec:      'h264',
  audioCodec:      'aac',
  width:           1920,
  height:          1080,
  frameRate:       FRAME_RATES.FPS_30,
  audioSampleRate: 48000,
} as const;

// ─── Project ──────────────────────────────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1 as const;

export interface Project {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly id: StableId;
  readonly name: string;
  readonly createdAt: string;     // ISO 8601
  readonly updatedAt: string;     // ISO 8601
  readonly projectFilePath?: string;  // undefined = unsaved new project

  /** All compositions (including main). Keyed by composition ID. */
  readonly compositionRegistry: Readonly<Record<StableId, Composition>>;

  /** ID of the root/main timeline composition */
  readonly mainCompositionId: StableId;

  /** All imported media assets. Keyed by asset ID. */
  readonly assetRegistry: Readonly<Record<StableId, MediaAsset>>;

  readonly defaultFrameRate: Rational;
  readonly defaultCanvas: CanvasSize;
  readonly exportDefaults: ExportSettings;

  readonly metadata: Record<string, unknown>;
}

// ─── Project Creation Helper ──────────────────────────────────────────────────

export function createDefaultProject(
  name: string,
  id: StableId,
  mainCompId: StableId,
): Project {
  const now = new Date().toISOString();
  const canvas: CanvasSize = { width: 1920, height: 1080 };
  const fps = FRAME_RATES.FPS_30;

  const mainComposition: Composition = {
    id:              mainCompId,
    name:            'Main Edit',
    width:           canvas.width,
    height:          canvas.height,
    frameRate:       fps,
    durationTicks:   0,
    background:      '#000000',
    orderedLayerIds: [],
    layers:          {},
    markers:         [],
    metadata:        {},
  };

  return {
    schemaVersion:       CURRENT_SCHEMA_VERSION,
    id,
    name,
    createdAt:           now,
    updatedAt:           now,
    compositionRegistry: { [mainCompId]: mainComposition },
    mainCompositionId:   mainCompId,
    assetRegistry:       {},
    defaultFrameRate:    fps,
    defaultCanvas:       canvas,
    exportDefaults:      DEFAULT_EXPORT_SETTINGS,
    metadata:            {},
  };
}
