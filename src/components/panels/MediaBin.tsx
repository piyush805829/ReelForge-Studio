/**
 * ReelForge Studio — Media Bin Panel
 *
 * Displays all imported media assets with thumbnails, metadata,
 * and an import button. Milestone 1: real import via Tauri dialog.
 */

import { useCallback, useState, useMemo } from 'react';
import {
  FolderOpen,
  Film,
  Music,
  Image,
  AlertCircle,
  Search,
  Grid,
  List,
  Plus,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useProjectStore, selectActiveComposition } from '../../state/projectStore';
import { cmdImportAsset, cmdAddLayer } from '../../timeline/commands/timelineCommands';
import type { MediaAsset, MediaType, Layer } from '../../project/schema/types';
import { DEFAULT_TRANSFORM, DEFAULT_AUDIO_SETTINGS } from '../../project/schema/types';
import { secondsToTicks } from '../../timeline/time/timeConversions';
import { cn } from '../../lib/utils';

// ─── Tauri IPC Shim ──────────────────────────────────────────────────────────

/**
 * In Milestone 1, Tauri isn't built yet.
 * We stub the IPC calls so the UI renders; they will fail gracefully.
 */
async function pickMediaFiles(): Promise<string[] | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({
      multiple: true,
      filters: [
        { name: 'Video',  extensions: ['mp4','mov','mkv','avi','webm','m4v','mts'] },
        { name: 'Audio',  extensions: ['mp3','wav','aac','flac','ogg','m4a'] },
        { name: 'Image',  extensions: ['jpg','jpeg','png','gif','webp','tiff','bmp'] },
        { name: 'All Media', extensions: ['mp4','mov','mkv','avi','webm','m4v','mp3','wav','aac','flac','png','jpg','jpeg','gif','webp'] },
      ],
    });
    if (!result) return null;
    return Array.isArray(result) ? result as string[] : [result as string];
  } catch {
    // Tauri not available (dev mode without backend)
    return null;
  }
}

async function probeMediaFile(path: string): Promise<Partial<MediaAsset> | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<Partial<MediaAsset>>('probe_media_file', { path });
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMediaIcon(type: MediaType) {
  switch (type) {
    case 'video': return Film;
    case 'audio': return Music;
    case 'image': return Image;
  }
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function guessMediaType(path: string): MediaType {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4','mov','mkv','avi','webm','m4v','mts'].includes(ext)) return 'video';
  if (['mp3','wav','aac','flac','ogg','m4a'].includes(ext)) return 'audio';
  return 'image';
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

// ─── Component ────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list';

export default function MediaBin() {
  const execute = useProjectStore(state => state.execute);
  const assetRegistry = useProjectStore(state => state.project.assetRegistry);
  const assets = useMemo(() => Object.values(assetRegistry), [assetRegistry]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter]     = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return assets.filter(a =>
      a.name.toLowerCase().includes(filter.toLowerCase())
    );
  }, [assets, filter]);

  // ─── Import Handler ─────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);

    try {
      const paths = await pickMediaFiles();
      if (!paths || paths.length === 0) return;

      for (const path of paths) {
        const mediaType = guessMediaType(path);
        const name = basename(path);

        // Try to probe with Tauri backend; fall back to minimal asset
        const probed = await probeMediaFile(path);

        const asset: MediaAsset = {
          id:               uuidv4(),
          mediaType,
          originalPath:     path,
          name,
          duration:         probed?.duration ?? 0,
          width:            probed?.width,
          height:           probed?.height,
          frameRate:        probed?.frameRate,
          pixelAspectRatio: probed?.pixelAspectRatio ?? 1,
          videoStream:      probed?.videoStream,
          audioStream:      probed?.audioStream,
          thumbnails:       probed?.thumbnails ?? [],
          missingStatus:    'present',
          importedAt:       new Date().toISOString(),
          metadata:         {},
        };

        const result = execute('Import Asset', draft => cmdImportAsset(draft, { asset }));
        if (!result.ok) {
          setImportError(result.error);
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [execute]);

  const comp = useProjectStore(selectActiveComposition);
  const playheadTicks = useProjectStore(state => state.playback.currentTicks);
  const selectLayer = useProjectStore(state => state.selectLayer);

  const handleAddToTimeline = useCallback((asset: MediaAsset) => {
    if (!comp) return;
    const durationSec = asset.duration > 0 ? asset.duration : 5;
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
      timelineStartTicks: playheadTicks,
      timelineDurationTicks: secondsToTicks(durationSec),
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

    const res = execute('Add Clip from Media Bin', draft =>
      cmdAddLayer(draft, { compositionId: comp.id, layer: newLayer })
    );
    if (res.ok) {
      selectLayer(newLayer.id, false);
    }
  }, [comp, playheadTicks, execute, selectLayer]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="panel-header justify-between">
        <span>Media</span>
        <div className="flex items-center gap-1">
          <button
            className={cn('p-1 rounded hover:bg-forge-bg-elevated transition-colors', viewMode === 'grid' && 'text-forge-accent-violet')}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <Grid size={11} />
          </button>
          <button
            className={cn('p-1 rounded hover:bg-forge-bg-elevated transition-colors', viewMode === 'list' && 'text-forge-accent-violet')}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <List size={11} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-forge-border-subtle">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-forge-text-muted" />
          <input
            className="forge-input pl-6 h-6 text-xxs w-full"
            placeholder="Search media…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Error */}
      {importError && (
        <div className="mx-2 mt-1.5 px-2 py-1.5 rounded bg-forge-status-error/10 border border-forge-status-error/30 flex items-center gap-1.5 text-forge-status-error text-xxs">
          <AlertCircle size={11} />
          <span className="truncate">{importError}</span>
        </div>
      )}

      {/* Asset list / grid */}
      <div className="flex-1 forge-scroll p-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-forge-bg-elevated flex items-center justify-center">
              <Film size={22} className="text-forge-text-muted" />
            </div>
            <div>
              <p className="text-forge-text-secondary text-xs font-medium">No media yet</p>
              <p className="text-forge-text-muted text-xxs mt-0.5">
                {assets.length === 0
                  ? 'Import video, audio, or images to get started'
                  : 'No results for "' + filter + '"'}
              </p>
            </div>
          </div>
        )}

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(asset => (
              <AssetGridItem
                key={asset.id}
                asset={asset}
                onAddToTimeline={handleAddToTimeline}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map(asset => (
              <AssetListItem
                key={asset.id}
                asset={asset}
                onAddToTimeline={handleAddToTimeline}
              />
            ))}
          </div>
        )}
      </div>

      {/* Import Button */}
      <div className="p-2 border-t border-forge-border-subtle flex-shrink-0">
        <button
          id="media-import-btn"
          className="btn-primary w-full flex items-center justify-center gap-1.5"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? (
            <span className="animate-pulse">Importing…</span>
          ) : (
            <>
              <FolderOpen size={13} />
              Import Media
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Grid Item ─────────────────────────────────────────────────────────────────

function AssetGridItem({
  asset,
  onAddToTimeline,
}: {
  asset: MediaAsset;
  onAddToTimeline: (asset: MediaAsset) => void;
}) {
  const Icon = getMediaIcon(asset.mediaType);
  const thumb = asset.thumbnails[0];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reelforge-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="media-thumb group flex flex-col cursor-grab active:cursor-grabbing relative overflow-hidden"
      title={`${asset.name} (Double-click or drag to timeline)`}
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={() => onAddToTimeline(asset)}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-forge-bg-tertiary flex items-center justify-center">
        {thumb ? (
          <img
            src={`asset-protocol://${thumb.cachePath}`}
            alt={asset.name}
            className="w-full h-full object-cover pointer-events-none"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Icon size={20} className="text-forge-text-muted" />
        )}

        {/* Missing badge */}
        {asset.missingStatus === 'missing' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <AlertCircle size={16} className="text-forge-status-error" />
          </div>
        )}

        {/* Duration badge */}
        {asset.duration > 0 && (
          <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 text-xxs text-white">
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Media type badge */}
        <div className="absolute top-1 left-1 bg-black/60 rounded px-1 text-xxs text-forge-text-secondary">
          <Icon size={9} className="inline" />
        </div>

        {/* Quick Add Overlay on hover */}
        <div className="absolute inset-0 bg-forge-bg-primary/80 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 text-xxs font-medium text-forge-text-primary transition-opacity">
          <button
            className="px-2 py-1 rounded bg-forge-accent-violet hover:bg-forge-accent-violet/90 text-white flex items-center gap-1 shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddToTimeline(asset);
            }}
            title="Add to Timeline"
          >
            <Plus size={11} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="px-1.5 py-1">
        <p className="text-xxs text-forge-text-primary truncate" title={asset.name}>
          {asset.name}
        </p>
        {asset.width && asset.height && (
          <p className="text-xxs text-forge-text-muted">
            {asset.width}×{asset.height}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── List Item ─────────────────────────────────────────────────────────────────

function AssetListItem({
  asset,
  onAddToTimeline,
}: {
  asset: MediaAsset;
  onAddToTimeline: (asset: MediaAsset) => void;
}) {
  const Icon = getMediaIcon(asset.mediaType);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reelforge-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-forge-bg-elevated cursor-grab active:cursor-grabbing group select-none"
      title={`${asset.name} (Double-click or drag to timeline)`}
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={() => onAddToTimeline(asset)}
    >
      <div className="w-7 h-7 rounded bg-forge-bg-tertiary flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-forge-text-muted group-hover:text-forge-accent-violet transition-colors" />
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="text-xs text-forge-text-primary truncate">{asset.name}</p>
        <p className="text-xxs text-forge-text-muted">
          {asset.mediaType}
          {asset.duration > 0 && ` · ${formatDuration(asset.duration)}`}
          {asset.width && ` · ${asset.width}×${asset.height}`}
        </p>
      </div>
      <button
        className="p-1 rounded text-forge-text-muted opacity-0 group-hover:opacity-100 hover:text-white hover:bg-forge-accent-violet transition-all"
        onClick={(e) => {
          e.stopPropagation();
          onAddToTimeline(asset);
        }}
        title="Add to Timeline"
      >
        <Plus size={12} />
      </button>
      {asset.missingStatus === 'missing' && (
        <AlertCircle size={11} className="text-forge-status-error flex-shrink-0" />
      )}
    </div>
  );
}
