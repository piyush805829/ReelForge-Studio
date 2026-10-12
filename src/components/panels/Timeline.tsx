/**
 * ReelForge Studio — Interactive Multitrack Timeline Panel
 *
 * Features:
 *   - Clip Selection (single & multi-selection, independent of playhead)
 *   - Drag-to-Move with real-time preview and single undo entry on commit
 *   - Left & Right Trim handles with bounds enforcement and non-1x speed support
 *   - Snapping to other clip starts/ends, playhead, and zero with visual guide line
 *   - Snapping toggle & temporary modifier bypass (Alt / Shift)
 *   - Split at Playhead (Razor tool button & Ctrl+B)
 *   - Delete Selected Clip (Trash button & Del / Backspace)
 *   - MediaBin Drag-and-Drop directly onto timeline tracks
 *   - Dynamic Ruler with tick marks & click-to-seek
 *   - Zoom controls
 */

import React, { useRef, useCallback, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  Film,
  Music,
  Image,
  Type,
  Layers,
  Scissors,
  Trash2,
  Magnet,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  useProjectStore,
  selectActiveComposition,
} from '../../state/projectStore';
import type { Layer } from '../../project/schema/types';
import {
  DEFAULT_TRANSFORM,
  DEFAULT_AUDIO_SETTINGS,
} from '../../project/schema/types';
import {
  ticksToPixels,
  pixelsToTicks,
  ticksToTimecode,
  ticksToSeconds,
  secondsToTicks,
} from '../../timeline/time/timeConversions';
import { snapTick, type SnapResult } from '../../timeline/time/snapping';
import {
  cmdMoveLayer,
  cmdTrimLayerStart,
  cmdTrimLayerEnd,
  cmdSplitLayer,
  cmdDeleteLayer,
  cmdAddLayer,
} from '../../timeline/commands/timelineCommands';
import { cn } from '../../lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACK_HEIGHT = 44;
const HEADER_WIDTH = 160;
const RULER_HEIGHT = 26;
const MIN_CLIP_DURATION_TICKS = 8_000; // 1 frame at 30fps

// ─── Layer color by type ──────────────────────────────────────────────────────

function layerColor(type: Layer['layerType']): string {
  switch (type) {
    case 'video': return '#3B82F6';
    case 'audio': return '#22C55E';
    case 'image': return '#EC4899';
    case 'text':  return '#F59E0B';
    case 'shape': return '#8B5CF6';
    case 'nested-composition': return '#06B6D4';
    case 'solid': return '#6B7280';
    default: return '#6B7280';
  }
}

function LayerIcon({ type }: { type: Layer['layerType'] }) {
  const size = 12;
  switch (type) {
    case 'video': return <Film size={size} />;
    case 'audio': return <Music size={size} />;
    case 'image': return <Image size={size} />;
    case 'text':  return <Type size={size} />;
    case 'nested-composition': return <Layers size={size} />;
    default: return <Film size={size} />;
  }
}

// ─── Main Timeline Component ──────────────────────────────────────────────────

export default function Timeline() {
  const ppt = useProjectStore(state => state.ui.timelinePixelsPerTick);
  const selectedLayerIds = useProjectStore(state => state.ui.selectedLayerIds);
  const currentTicks = useProjectStore(state => state.playback.currentTicks);
  const setPlayback = useProjectStore(state => state.setPlayback);
  const setUI = useProjectStore(state => state.setUI);
  const selectLayer = useProjectStore(state => state.selectLayer);
  const clearSelection = useProjectStore(state => state.clearSelection);
  const execute = useProjectStore(state => state.execute);
  const assetRegistry = useProjectStore(state => state.project.assetRegistry);

  const comp = useProjectStore(selectActiveComposition);
  const layers = useMemo(() => {
    if (!comp) return [];
    return comp.orderedLayerIds.map(id => comp.layers[id]).filter(Boolean);
  }, [comp]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Snapping settings
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [activeSnapTick, setActiveSnapTick] = useState<number | null>(null);

  // Local drag preview state: layerId -> { startTicks: number, durationTicks: number }
  const [dragPreview, setDragPreview] = useState<{
    layerId: string;
    startTicks: number;
    durationTicks: number;
  } | null>(null);

  // Drop target feedback
  const [isDragOverTimeline, setIsDragOverTimeline] = useState(false);

  // Total content width based on composition duration and layers
  const maxLayerEndTicks = useMemo(() => {
    let max = comp?.durationTicks ?? 240_000 * 30;
    for (const l of layers) {
      const end = l.timelineStartTicks + l.timelineDurationTicks;
      if (end > max) max = end;
    }
    return max;
  }, [comp?.durationTicks, layers]);

  const totalWidth = Math.max(ticksToPixels(maxLayerEndTicks, ppt) + 400, 1000);

  // ─── Ruler clicks → seek ────────────────────────────────────────────────────

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0) - HEADER_WIDTH;
    if (x < 0) return;
    const ticks = Math.round(pixelsToTicks(x, ppt));
    setPlayback({ currentTicks: Math.max(0, ticks), isPlaying: false });
  }, [ppt, setPlayback]);

  // ─── Zoom Controls ──────────────────────────────────────────────────────────

  const handleZoom = useCallback((factor: number) => {
    const next = Math.max(0.00005, Math.min(0.05, ppt * factor));
    setUI({ timelinePixelsPerTick: next });
  }, [ppt, setUI]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.85;
      handleZoom(factor);
    }
  }, [handleZoom]);

  // ─── Ruler tick intervals ───────────────────────────────────────────────────

  const tickMarks = useMemo(() => {
    if (!comp) return [];
    const secondsPerPx = 1 / (ppt * 240_000);
    // Target: ~80px between major ticks
    const targetIntervalSec = secondsPerPx * 80;
    const intervals = [0.04, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
    const interval = intervals.find(i => i >= targetIntervalSec) ?? 300;
    const marks: { ticks: number; label: string; major: boolean }[] = [];
    const maxSec = ticksToSeconds(maxLayerEndTicks) + interval * 2;

    for (let sec = 0; sec <= maxSec; sec += interval) {
      const t = Math.round(sec * 240_000);
      marks.push({
        ticks: t,
        label: ticksToTimecode(t, comp.frameRate),
        major: true,
      });
    }
    return marks;
  }, [comp, ppt, maxLayerEndTicks]);

  // ─── Razor / Split Action ───────────────────────────────────────────────────

  const canSplitSelected = useMemo(() => {
    if (!comp || selectedLayerIds.size !== 1) return false;
    const selectedId = Array.from(selectedLayerIds)[0];
    const layer = comp.layers[selectedId];
    if (!layer) return false;
    const layerEnd = layer.timelineStartTicks + layer.timelineDurationTicks;
    return currentTicks > layer.timelineStartTicks && currentTicks < layerEnd;
  }, [comp, selectedLayerIds, currentTicks]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (!comp || !canSplitSelected) return;
    const selectedId = Array.from(selectedLayerIds)[0];
    const res = execute('Split Clip at Playhead', draft =>
      cmdSplitLayer(draft, {
        compositionId: comp.id,
        layerId: selectedId,
        splitTimeTicks: currentTicks,
      })
    );
    if (res.ok && res.value) {
      // Select the right clip segment after split
      selectLayer(res.value.rightLayerId, false);
    }
  }, [comp, canSplitSelected, selectedLayerIds, currentTicks, execute, selectLayer]);

  // ─── Delete Selected Action ─────────────────────────────────────────────────

  const canDeleteSelected = selectedLayerIds.size > 0;

  const handleDeleteSelected = useCallback(() => {
    if (!comp || selectedLayerIds.size === 0) return;
    const ids = Array.from(selectedLayerIds);
    for (const id of ids) {
      execute('Delete Clip', draft =>
        cmdDeleteLayer(draft, { compositionId: comp.id, layerId: id })
      );
    }
    clearSelection();
  }, [comp, selectedLayerIds, execute, clearSelection]);

  // ─── Media Bin Drag & Drop onto Timeline ───────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/reelforge-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOverTimeline(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOverTimeline(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverTimeline(false);
    if (!comp) return;

    const assetId = e.dataTransfer.getData('application/reelforge-asset-id');
    if (!assetId) return;

    const asset = assetRegistry[assetId];
    if (!asset) return;

    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const rect = e.currentTarget.getBoundingClientRect();
    const dropPixelX = e.clientX - rect.left - HEADER_WIDTH + scrollLeft;
    let dropTicks = Math.max(0, Math.round(pixelsToTicks(dropPixelX, ppt)));

    // Snap drop position if enabled
    if (snappingEnabled && !e.altKey && !e.shiftKey) {
      const snap = snapTick(dropTicks, {
        pixelsPerTick: ppt,
        layers,
        playheadTicks: currentTicks,
        snapToZero: true,
      });
      dropTicks = snap.snappedTick;
    }

    // Determine duration
    const durationSec = asset.duration > 0 ? asset.duration : 5;
    const durationTicks = secondsToTicks(durationSec);

    const newLayer: Layer = {
      id: uuidv4(),
      name: asset.name,
      layerType: asset.mediaType,
      enabled: true,
      locked: false,
      visible: true,
      blendMode: 'normal',
      source: { kind: 'asset', assetId: asset.id },
      sourceInSeconds: 0,
      sourceOutSeconds: durationSec,
      timelineStartTicks: dropTicks,
      timelineDurationTicks: durationTicks,
      speed: 1.0,
      transform: DEFAULT_TRANSFORM,
      fitMode: 'contain',
      keyframeTracks: [],
      effects: [],
      masks: [],
      audioSettings: asset.mediaType === 'audio' || asset.mediaType === 'video'
        ? DEFAULT_AUDIO_SETTINGS
        : undefined,
      metadata: {},
    };

    const result = execute('Add Clip from Media Bin', draft =>
      cmdAddLayer(draft, { compositionId: comp.id, layer: newLayer })
    );

    if (result.ok) {
      selectLayer(newLayer.id, false);
    }
  }, [comp, assetRegistry, ppt, snappingEnabled, layers, currentTicks, execute, selectLayer]);

  const playheadX = ticksToPixels(currentTicks, ppt) + HEADER_WIDTH;
  const snapLineX = activeSnapTick !== null
    ? ticksToPixels(activeSnapTick, ppt) + HEADER_WIDTH
    : null;

  if (!comp) {
    return (
      <div className="h-full flex items-center justify-center text-forge-text-muted text-xs">
        No composition loaded
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full relative select-none"
      onWheel={handleWheel}
      onClick={clearSelection}
    >
      {/* ─── Timeline Toolbar ─── */}
      <div
        className="flex items-center gap-2 px-3 h-8 border-b border-forge-border-subtle flex-shrink-0 bg-forge-bg-secondary"
        onClick={e => e.stopPropagation()}
      >
        {/* Razor / Split button */}
        <button
          id="timeline-split-btn"
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xxs font-medium transition-all',
            canSplitSelected
              ? 'bg-forge-bg-elevated text-forge-text-primary hover:bg-forge-accent-violet hover:text-white shadow-sm'
              : 'text-forge-text-muted opacity-40 cursor-not-allowed'
          )}
          onClick={handleSplitAtPlayhead}
          disabled={!canSplitSelected}
          title="Split Selected Clip at Playhead (Ctrl+B)"
        >
          <Scissors size={12} />
          <span>Split</span>
        </button>

        {/* Delete clip button */}
        <button
          id="timeline-delete-btn"
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xxs font-medium transition-all',
            canDeleteSelected
              ? 'bg-forge-bg-elevated text-forge-text-primary hover:bg-forge-status-error hover:text-white'
              : 'text-forge-text-muted opacity-40 cursor-not-allowed'
          )}
          onClick={handleDeleteSelected}
          disabled={!canDeleteSelected}
          title="Delete Selected Clip (Del)"
        >
          <Trash2 size={12} />
          <span>Delete</span>
        </button>

        <div className="h-4 w-px bg-forge-border-subtle mx-1" />

        {/* Snapping Toggle */}
        <button
          id="timeline-snap-toggle"
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xxs font-medium transition-all',
            snappingEnabled
              ? 'bg-forge-accent-violet/20 text-forge-accent-violet border border-forge-accent-violet/30'
              : 'bg-forge-bg-elevated text-forge-text-muted hover:text-forge-text-secondary'
          )}
          onClick={() => setSnappingEnabled(!snappingEnabled)}
          title={snappingEnabled ? 'Snapping Enabled (Hold Alt/Shift to bypass)' : 'Snapping Disabled'}
        >
          <Magnet size={12} />
          <span>Snap</span>
        </button>

        <div className="h-4 w-px bg-forge-border-subtle mx-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1.5">
          <button
            className="p-1 text-forge-text-muted hover:text-forge-text-primary transition-colors"
            onClick={() => handleZoom(0.8)}
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <input
            type="range"
            min={0.00005} max={0.05} step={0.00001}
            value={ppt}
            onChange={e => setUI({ timelinePixelsPerTick: parseFloat(e.target.value) })}
            className="w-20 accent-forge-accent-violet cursor-pointer"
            title="Timeline Zoom"
          />
          <button
            className="p-1 text-forge-text-muted hover:text-forge-text-primary transition-colors"
            onClick={() => handleZoom(1.25)}
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>
        </div>

        {/* Current Timecode */}
        <div className="px-2 py-0.5 rounded bg-forge-bg-tertiary text-xxs font-mono text-forge-accent-teal">
          {ticksToTimecode(currentTicks, comp.frameRate)}
        </div>

        <div className="flex-1" />

        <span className="text-xxs text-forge-text-muted">
          {layers.length} track{layers.length !== 1 ? 's' : ''}
          {selectedLayerIds.size > 0 && ` · ${selectedLayerIds.size} selected`}
        </span>
      </div>

      {/* ─── Scrollable Timeline Body ─── */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-auto relative forge-scroll transition-colors',
          isDragOverTimeline && 'bg-forge-accent-violet/5'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ width: totalWidth + HEADER_WIDTH, minHeight: '100%', position: 'relative' }}>

          {/* ─── Ruler ─── */}
          <div
            className="sticky top-0 z-20 flex bg-forge-bg-secondary border-b border-forge-border-default cursor-crosshair select-none"
            style={{ height: RULER_HEIGHT }}
            onClick={handleRulerClick}
          >
            {/* Header spacer */}
            <div
              className="flex-shrink-0 border-r border-forge-border-default bg-forge-bg-secondary flex items-center px-2"
              style={{ width: HEADER_WIDTH }}
            >
              <span className="text-xxxs font-mono uppercase tracking-wider text-forge-text-muted">Tracks</span>
            </div>

            {/* Tick marks */}
            <div className="relative flex-1 overflow-hidden pointer-events-none">
              {tickMarks.map(m => {
                const x = ticksToPixels(m.ticks, ppt);
                return (
                  <div
                    key={m.ticks}
                    className="absolute top-0 h-full"
                    style={{ left: x }}
                  >
                    <div className="absolute bottom-0 h-3 w-px bg-forge-border-default" />
                    <span className="absolute top-1 left-1 text-xxs font-mono text-forge-text-muted whitespace-nowrap">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Empty state ─── */}
          {layers.length === 0 && (
            <div
              className="flex items-center justify-center text-forge-text-muted text-xs border-b border-forge-border-subtle"
              style={{ height: TRACK_HEIGHT * 3, marginLeft: HEADER_WIDTH }}
            >
              Drag media assets from the Media Bin onto the timeline
            </div>
          )}

          {/* ─── Track Rows ─── */}
          {[...layers].reverse().map(layer => (
            <InteractiveTimelineTrack
              key={layer.id}
              compositionId={comp.id}
              layer={layer}
              allLayers={layers}
              ppt={ppt}
              playheadTicks={currentTicks}
              isSelected={selectedLayerIds.has(layer.id)}
              snappingEnabled={snappingEnabled}
              dragPreview={dragPreview?.layerId === layer.id ? dragPreview : null}
              onSelect={(id, multi) => selectLayer(id, multi)}
              onDragChange={setDragPreview}
              onSnapTickChange={setActiveSnapTick}
            />
          ))}

          {/* ─── Snap Guide Line ─── */}
          {snapLineX !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-forge-accent-teal z-25 pointer-events-none shadow-[0_0_6px_rgba(20,184,166,0.8)]"
              style={{ left: snapLineX }}
            >
              <div className="absolute top-1 -left-1.5 w-3 h-3 bg-forge-accent-teal rounded-full opacity-80" />
            </div>
          )}

          {/* ─── Playhead ─── */}
          <div
            className="absolute top-0 bottom-0 w-px bg-forge-accent-violet z-30 pointer-events-none"
            style={{ left: playheadX }}
          >
            {/* Playhead indicator */}
            <div
              className="absolute -top-0 -left-2 w-4 h-4 bg-forge-accent-violet shadow-sm"
              style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Interactive Track Row Component ──────────────────────────────────────────

interface InteractiveTrackProps {
  compositionId: string;
  layer: Layer;
  allLayers: ReadonlyArray<Layer>;
  ppt: number;
  playheadTicks: number;
  isSelected: boolean;
  snappingEnabled: boolean;
  dragPreview: { startTicks: number; durationTicks: number } | null;
  onSelect: (id: string, multi: boolean) => void;
  onDragChange: (preview: { layerId: string; startTicks: number; durationTicks: number } | null) => void;
  onSnapTickChange: (tick: number | null) => void;
}

function InteractiveTimelineTrack({
  compositionId,
  layer,
  allLayers,
  ppt,
  playheadTicks,
  isSelected,
  snappingEnabled,
  dragPreview,
  onSelect,
  onDragChange,
  onSnapTickChange,
}: InteractiveTrackProps) {
  const execute = useProjectStore(state => state.execute);
  const color = layerColor(layer.layerType);

  // Use temporary drag preview if active, otherwise authoritative layer ticks
  const currentStartTicks = dragPreview ? dragPreview.startTicks : layer.timelineStartTicks;
  const currentDurationTicks = dragPreview ? dragPreview.durationTicks : layer.timelineDurationTicks;

  const clipLeft = ticksToPixels(currentStartTicks, ppt);
  const clipWidth = ticksToPixels(currentDurationTicks, ppt);

  // Active interaction drag state
  const dragRef = useRef<{
    active: boolean;
    mode: 'move' | 'trim-start' | 'trim-end';
    startPointerX: number;
    initialStartTicks: number;
    initialDurationTicks: number;
    lastPreviewStart: number;
    lastPreviewDuration: number;
  } | null>(null);

  // ─── Pointer Down Gesture Handler ───────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();

    // Select the clip on pointer down
    onSelect(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);

    // Identify interaction target (handle or body)
    const target = e.target as HTMLElement;
    let mode: 'move' | 'trim-start' | 'trim-end' = 'move';
    if (target.classList.contains('resize-handle-left')) {
      mode = 'trim-start';
    } else if (target.classList.contains('resize-handle-right')) {
      mode = 'trim-end';
    }

    // Capture pointer on the element
    e.currentTarget.setPointerCapture(e.pointerId);

    dragRef.current = {
      active: true,
      mode,
      startPointerX: e.clientX,
      initialStartTicks: layer.timelineStartTicks,
      initialDurationTicks: layer.timelineDurationTicks,
      lastPreviewStart: layer.timelineStartTicks,
      lastPreviewDuration: layer.timelineDurationTicks,
    };
  }, [layer.id, layer.timelineStartTicks, layer.timelineDurationTicks, onSelect]);

  // ─── Pointer Move Handler ───────────────────────────────────────────────────

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;

    const dxPx = e.clientX - drag.startPointerX;
    const deltaTicks = Math.round(pixelsToTicks(dxPx, ppt));

    const bypassSnapping = !snappingEnabled || e.altKey || e.shiftKey;

    let nextStart = drag.initialStartTicks;
    let nextDuration = drag.initialDurationTicks;
    let snapResult: SnapResult | null = null;

    if (drag.mode === 'move') {
      const candidateStart = Math.max(0, drag.initialStartTicks + deltaTicks);
      if (!bypassSnapping) {
        snapResult = snapTick(candidateStart, {
          pixelsPerTick: ppt,
          layers: allLayers,
          ignoreLayerId: layer.id,
          playheadTicks,
          snapToZero: true,
        });
        nextStart = snapResult.snappedTick;
      } else {
        nextStart = candidateStart;
      }
    } else if (drag.mode === 'trim-start') {
      // Left trim: change start, keep end fixed
      const originalEnd = drag.initialStartTicks + drag.initialDurationTicks;
      let candidateStart = drag.initialStartTicks + deltaTicks;

      // Ensure minimum duration
      candidateStart = Math.min(candidateStart, originalEnd - MIN_CLIP_DURATION_TICKS);
      candidateStart = Math.max(0, candidateStart);

      // Check sourceIn boundary: sourceIn cannot become negative
      const proposedDelta = candidateStart - layer.timelineStartTicks;
      const proposedSourceIn = layer.sourceInSeconds + (proposedDelta / 240_000) * layer.speed;
      if (proposedSourceIn < 0) {
        const maxBackwardDelta = -layer.sourceInSeconds * (240_000 / layer.speed);
        candidateStart = Math.max(0, Math.round(layer.timelineStartTicks + maxBackwardDelta));
      }

      if (!bypassSnapping) {
        snapResult = snapTick(candidateStart, {
          pixelsPerTick: ppt,
          layers: allLayers,
          ignoreLayerId: layer.id,
          playheadTicks,
          snapToZero: true,
        });
        if (snapResult.snappedTick < originalEnd - MIN_CLIP_DURATION_TICKS) {
          nextStart = snapResult.snappedTick;
        } else {
          nextStart = candidateStart;
        }
      } else {
        nextStart = candidateStart;
      }

      nextDuration = originalEnd - nextStart;
    } else if (drag.mode === 'trim-end') {
      // Right trim: keep start fixed, change duration
      let candidateEnd = drag.initialStartTicks + drag.initialDurationTicks + deltaTicks;
      candidateEnd = Math.max(drag.initialStartTicks + MIN_CLIP_DURATION_TICKS, candidateEnd);

      if (!bypassSnapping) {
        snapResult = snapTick(candidateEnd, {
          pixelsPerTick: ppt,
          layers: allLayers,
          ignoreLayerId: layer.id,
          playheadTicks,
          snapToZero: false,
        });
        if (snapResult.snappedTick > drag.initialStartTicks + MIN_CLIP_DURATION_TICKS) {
          candidateEnd = snapResult.snappedTick;
        }
      }

      nextDuration = candidateEnd - drag.initialStartTicks;
    }

    drag.lastPreviewStart = nextStart;
    drag.lastPreviewDuration = nextDuration;

    onDragChange({
      layerId: layer.id,
      startTicks: nextStart,
      durationTicks: nextDuration,
    });

    onSnapTickChange(snapResult?.target ? snapResult.snappedTick : null);
  }, [
    ppt,
    snappingEnabled,
    allLayers,
    layer.id,
    layer.timelineStartTicks,
    layer.sourceInSeconds,
    layer.speed,
    playheadTicks,
    onDragChange,
    onSnapTickChange,
  ]);

  // ─── Pointer Up Handler (Commit Command) ───────────────────────────────────

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback if capture lost
    }

    const { mode, lastPreviewStart, lastPreviewDuration, initialStartTicks, initialDurationTicks } = drag;
    dragRef.current = null;
    onDragChange(null);
    onSnapTickChange(null);

    // Commit single command based on the interaction type
    if (mode === 'move') {
      if (lastPreviewStart !== initialStartTicks) {
        execute('Move Clip', draft =>
          cmdMoveLayer(draft, {
            compositionId,
            layerId: layer.id,
            newTimelineStartTicks: lastPreviewStart,
          })
        );
      }
    } else if (mode === 'trim-start') {
      if (lastPreviewStart !== initialStartTicks) {
        execute('Trim Clip Start', draft =>
          cmdTrimLayerStart(draft, {
            compositionId,
            layerId: layer.id,
            newTimelineStartTicks: lastPreviewStart,
          })
        );
      }
    } else if (mode === 'trim-end') {
      const finalEndTicks = initialStartTicks + lastPreviewDuration;
      const initialEndTicks = initialStartTicks + initialDurationTicks;
      if (finalEndTicks !== initialEndTicks) {
        execute('Trim Clip End', draft =>
          cmdTrimLayerEnd(draft, {
            compositionId,
            layerId: layer.id,
            newTimelineEndTicks: finalEndTicks,
          })
        );
      }
    }
  }, [compositionId, layer.id, execute, onDragChange, onSnapTickChange]);

  // ─── Pointer Cancel Handler (Safe Rollback) ────────────────────────────────

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
    onDragChange(null);
    onSnapTickChange(null);
  }, [onDragChange, onSnapTickChange]);

  return (
    <div
      className="flex border-b border-forge-border-subtle"
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Track header */}
      <div
        className="flex-shrink-0 flex items-center gap-1.5 px-2 border-r border-forge-border-default bg-forge-bg-secondary select-none"
        style={{ width: HEADER_WIDTH }}
      >
        <div
          className="w-1.5 h-5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <LayerIcon type={layer.layerType} />
        <span className="text-xxs text-forge-text-secondary truncate flex-1 font-medium">{layer.name}</span>
        <button
          className="p-1 text-forge-text-muted hover:text-forge-text-primary transition-colors"
          title={layer.visible ? 'Hide Track' : 'Show Track'}
          onClick={e => {
            e.stopPropagation();
            execute(layer.visible ? 'Hide Layer' : 'Show Layer', draft => {
              const comp = draft.compositionRegistry[compositionId];
              if (comp?.layers[layer.id]) {
                (comp.layers as Record<string, Layer>)[layer.id] = {
                  ...comp.layers[layer.id],
                  visible: !layer.visible,
                };
              }
              return { ok: true, value: undefined };
            });
          }}
        >
          {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
      </div>

      {/* Track lane area */}
      <div className="relative flex-1 bg-forge-bg-primary hover:bg-forge-bg-tertiary/20 transition-colors">
        {/* Clip block */}
        <div
          className={cn(
            'timeline-clip group cursor-grab active:cursor-grabbing transition-shadow',
            isSelected && 'selected ring-2 ring-forge-accent-violet ring-offset-1 ring-offset-forge-bg-primary',
            dragPreview && 'opacity-90 shadow-forge-md'
          )}
          style={{
            left: clipLeft,
            width: Math.max(clipWidth, 8),
            backgroundColor: color + '2a',
            borderColor: isSelected ? '#7C3AED' : color + '77',
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          title={`${layer.name} · ${(currentDurationTicks / 240000).toFixed(2)}s`}
        >
          {/* Left Trim Handle */}
          <div
            className="resize-handle resize-handle-left cursor-ew-resize hover:bg-forge-accent-violet transition-colors"
            title="Trim Start"
          />

          {/* Clip label */}
          <div
            className="px-2 py-1 text-xxs font-medium truncate pointer-events-none flex items-center gap-1"
            style={{ color }}
          >
            <LayerIcon type={layer.layerType} />
            <span className="truncate">{layer.name}</span>
            {layer.speed !== 1.0 && (
              <span className="text-xxxs px-1 rounded bg-black/40 text-forge-text-muted">
                {layer.speed}x
              </span>
            )}
          </div>

          {/* Audio waveform visualization placeholder */}
          {layer.layerType === 'audio' && (
            <div className="absolute inset-x-2 bottom-1 top-5 flex items-center justify-around overflow-hidden opacity-30 pointer-events-none">
              {Array.from({ length: Math.min(Math.round(clipWidth / 4), 60) }).map((_, i) => (
                <div
                  key={i}
                  className="w-px rounded-full"
                  style={{
                    height: `${30 + Math.sin(i * 0.8) * 20 + Math.sin(i * 0.3) * 15}%`,
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
          )}

          {/* Right Trim Handle */}
          <div
            className="resize-handle resize-handle-right cursor-ew-resize hover:bg-forge-accent-violet transition-colors"
            title="Trim End"
          />
        </div>
      </div>
    </div>
  );
}
