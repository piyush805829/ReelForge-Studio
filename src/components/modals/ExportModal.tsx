/**
 * ReelForge Studio — Export Video Modal
 *
 * Provides real MP4 export UI using H.264 video and AAC audio.
 * Displays source clip details, format configuration, progress bar,
 * cancellation support, and error diagnostics.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Download,
  X,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Film,
  Sliders,
  FileVideo,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useProjectStore } from '../../state/projectStore';
import {
  validateExportTarget,
  buildFfmpegClipArgs,
  executeExportJob,
  type ClipExportOptions,
} from '../../export/exportPipeline';
import { isTauriEnvironment } from '../../project/storage/projectStorage';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const project = useProjectStore(state => state.project);
  const setFlags = useProjectStore(state => state.setFlags);

  const [resolution, setResolution] = useState<'1080p' | '720p' | 'source'>('1080p');
  const [outputName, setOutputName] = useState('reelforge_export.mp4');
  const [showCommandPreview, setShowCommandPreview] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const validation = useMemo(() => {
    return validateExportTarget(project);
  }, [project]);

  // Sync initial output name from project name
  useEffect(() => {
    if (project.name) {
      const sanitized = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      setOutputName(`${sanitized}.mp4`);
    }
  }, [project.name]);

  if (!isOpen) return null;

  const targetAsset = validation.targetAsset;
  const targetLayer = validation.targetLayer;

  let outWidth = 1920;
  let outHeight = 1080;
  if (resolution === '720p') {
    outWidth = 1280;
    outHeight = 720;
  } else if (resolution === 'source' && targetAsset?.width && targetAsset?.height) {
    outWidth = targetAsset.width;
    outHeight = targetAsset.height;
  }

  const exportOptions: ClipExportOptions = {
    sourcePath: targetAsset?.relinkPath || targetAsset?.originalPath || 'source_clip.mp4',
    outputPath: outputName,
    inSeconds: validation.inSeconds ?? 0,
    durationSeconds: validation.durationSeconds ?? 0,
    width: outWidth,
    height: outHeight,
    videoCodec: 'h264',
    audioCodec: 'aac',
    frameRate: targetAsset?.frameRate || project.defaultFrameRate,
  };

  const commandArgs = buildFfmpegClipArgs(exportOptions);
  const commandPreview = `ffmpeg ${commandArgs.map(a => (a.includes(' ') || a.includes(':') ? `"${a}"` : a)).join(' ')}`;

  const handleStartExport = async () => {
    if (!validation.valid || !targetAsset) return;

    setExportError(null);
    setExportSuccessPath(null);
    setIsExporting(true);
    setProgressPercent(0);
    setFlags({ isExporting: true, exportProgress: 0 });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await executeExportJob(
        exportOptions,
        progress => {
          setProgressPercent(progress.percent);
          setFlags({ exportProgress: progress.percent / 100 });
        },
        abortController.signal
      );

      if (result.success) {
        setExportSuccessPath(result.outputPath || outputName);
        setProgressPercent(100);
      } else if (result.cancelled) {
        setExportError('Export was cancelled by user.');
      } else {
        setExportError(result.error || 'Export failed.');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
      setFlags({ isExporting: false, exportProgress: 0 });
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExporting(false);
    setFlags({ isExporting: false, exportProgress: 0 });
  };

  const isTauri = isTauriEnvironment();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-forge-bg-secondary border border-forge-border-default rounded-xl w-full max-w-xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-forge-accent-violet/15 text-forge-accent-violet">
              <Download size={18} />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-sm font-semibold text-forge-text-primary">
                Export Timeline Clip
              </h3>
              <p className="text-xxs text-forge-text-secondary">
                Render timeline video to MP4 using H.264 and AAC audio via FFmpeg.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 rounded-md text-forge-text-muted hover:text-forge-text-primary hover:bg-forge-bg-elevated transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Validation Warning */}
        {!validation.valid && (
          <div className="p-3 rounded-lg bg-forge-status-error/15 border border-forge-status-error/30 flex items-start gap-2.5 text-forge-status-error text-xs">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Cannot Export</p>
              <p className="text-xxs mt-0.5 leading-relaxed">{validation.error}</p>
            </div>
          </div>
        )}

        {/* Source Clip Summary */}
        {validation.valid && targetAsset && targetLayer && (
          <div className="bg-forge-bg-elevated/80 border border-forge-border-subtle rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-forge-text-primary">
              <div className="flex items-center gap-1.5 truncate max-w-xs">
                <Film size={13} className="text-forge-accent-violet" />
                <span className="truncate">{targetAsset.name}</span>
              </div>
              <span className="text-xxs text-forge-text-muted font-mono">
                Duration: {validation.durationSeconds?.toFixed(2)}s
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-3xs text-forge-text-secondary">
              <div>
                <span className="text-forge-text-muted">In-Point:</span> {validation.inSeconds?.toFixed(2)}s
              </div>
              <div>
                <span className="text-forge-text-muted">Source:</span> {targetAsset.width || 1920}×{targetAsset.height || 1080}
              </div>
              <div>
                <span className="text-forge-text-muted">Codec:</span> {targetAsset.videoStream?.codec || 'H.264'}
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        {validation.valid && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xxs font-medium text-forge-text-secondary mb-1">
                  Output Filename
                </label>
                <div className="relative">
                  <FileVideo size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-forge-text-muted" />
                  <input
                    type="text"
                    value={outputName}
                    disabled={isExporting}
                    onChange={e => setOutputName(e.target.value)}
                    className="forge-input pl-8 w-full text-xs"
                    placeholder="export.mp4"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xxs font-medium text-forge-text-secondary mb-1">
                  Resolution Preset
                </label>
                <div className="relative">
                  <Sliders size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-forge-text-muted" />
                  <select
                    value={resolution}
                    disabled={isExporting}
                    onChange={e => setResolution(e.target.value as '1080p' | '720p' | 'source')}
                    className="forge-input pl-8 w-full text-xs bg-forge-bg-tertiary"
                  >
                    <option value="1080p">1080p Full HD (1920×1080)</option>
                    <option value="720p">720p HD (1280×720)</option>
                    <option value="source">Match Source Aspect / Size</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Encoding Spec Summary */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-forge-bg-tertiary text-3xs text-forge-text-muted">
              <span>Container: <strong>MP4</strong></span>
              <span>Video: <strong>H.264 (libx264, yuv420p)</strong></span>
              <span>Audio: <strong>AAC (192 kbps, 48kHz)</strong></span>
            </div>

            {/* Command Preview Accordion */}
            <div className="border border-forge-border-subtle rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCommandPreview(!showCommandPreview)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-3xs text-forge-text-muted hover:bg-forge-bg-elevated transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Terminal size={11} />
                  <span>FFmpeg Command Details</span>
                </div>
                {showCommandPreview ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showCommandPreview && (
                <div className="p-2.5 bg-black/50 font-mono text-3xs text-forge-text-secondary break-all select-all border-t border-forge-border-subtle">
                  {commandPreview}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Bar (when active) */}
        {isExporting && (
          <div className="space-y-1.5 p-3 rounded-lg bg-forge-bg-elevated border border-forge-accent-violet/30 animate-pulse">
            <div className="flex items-center justify-between text-xs font-medium text-forge-text-primary">
              <span>Rendering Video…</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-forge-bg-tertiary rounded-full h-2 overflow-hidden">
              <div
                className="bg-forge-gradient h-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-3xs text-forge-text-muted">
              Encoding H.264 frames and muxing AAC audio…
            </p>
          </div>
        )}

        {/* Success Alert */}
        {exportSuccessPath && !isExporting && (
          <div className="p-3 rounded-lg bg-forge-status-success/15 border border-forge-status-success/30 flex items-start gap-2.5 text-forge-status-success text-xs">
            <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Export Successful!</p>
              <p className="text-xxs mt-0.5 text-forge-text-secondary font-mono truncate max-w-md">
                Rendered to: {exportSuccessPath}
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {exportError && !isExporting && (
          <div className="p-3 rounded-lg bg-forge-status-error/15 border border-forge-status-error/30 flex items-start gap-2.5 text-forge-status-error text-xs">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Export Failed</p>
              <p className="text-xxs mt-0.5 text-forge-text-secondary leading-relaxed">{exportError}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-forge-border-subtle text-xxs text-forge-text-muted">
          <span>{isTauri ? 'Desktop Native Mode' : 'Browser Mode (Simulated / Diagnostics)'}</span>

          <div className="flex items-center gap-2">
            {isExporting ? (
              <button
                type="button"
                onClick={handleCancelExport}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-forge-status-error/20 text-forge-status-error hover:bg-forge-status-error/30 transition-colors"
              >
                Cancel Export
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-forge-text-secondary hover:text-forge-text-primary hover:bg-forge-bg-elevated transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  id="start-export-btn"
                  onClick={handleStartExport}
                  disabled={!validation.valid}
                  className="px-4 py-1.5 rounded-md text-xs font-medium bg-forge-accent-violet hover:bg-forge-accent-hover text-white transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={13} />
                  Start Export
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
