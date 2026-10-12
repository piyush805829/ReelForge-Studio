/**
 * ReelForge Studio — Preview Monitor
 *
 * Single HTML <video> element for playback of a selected asset/clip.
 * WebGL compositing overlay is a later milestone.
 * Centralised playback clock managed through projectStore.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
} from 'lucide-react';
import { useProjectStore, selectActiveComposition } from '../../state/projectStore';
import { ticksToSeconds, ticksToTimecode, secondsToTicks } from '../../timeline/time/timeConversions';
import { cn } from '../../lib/utils';

export default function PreviewMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playback, setPlayback } = useProjectStore();

  const comp = useProjectStore(selectActiveComposition);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Sync video element when playback.currentTicks changes externally (seek)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    const targetSeconds = ticksToSeconds(playback.currentTicks);
    if (Math.abs(video.currentTime - targetSeconds) > 0.05) {
      video.currentTime = targetSeconds;
    }
  }, [playback.currentTicks]);

  // Play/pause control
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    if (playback.isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playback.isPlaying]);

  // Update currentTicks during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function onTimeUpdate() {
      if (!video) return;
      setPlayback({ currentTicks: secondsToTicks(video.currentTime) });
    }
    function onEnded() {
      setPlayback({ isPlaying: false });
    }
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [setPlayback]);

  const handlePlayPause = useCallback(() => {
    setPlayback({ isPlaying: !playback.isPlaying });
  }, [playback.isPlaying, setPlayback]);

  const handleSeekToStart = useCallback(() => {
    setPlayback({ currentTicks: 0, isPlaying: false });
  }, [setPlayback]);

  const handleSeekToEnd = useCallback(() => {
    if (!comp) return;
    setPlayback({ currentTicks: comp.durationTicks, isPlaying: false });
  }, [comp, setPlayback]);

  const frameRate = comp?.frameRate ?? { numerator: 30, denominator: 1 };
  const timecode = ticksToTimecode(playback.currentTicks, frameRate);
  const totalTimecode = comp ? ticksToTimecode(comp.durationTicks, frameRate) : '00:00:00:00';

  // No preview content yet — show placeholder
  const hasContent = comp && comp.orderedLayerIds.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Monitor area */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {/* Canvas/composition info */}
        {comp && (
          <div className="absolute top-2 right-2 text-xxs text-forge-text-muted bg-black/60 px-1.5 py-0.5 rounded">
            {comp.width}×{comp.height}
          </div>
        )}

        {/* Video element (hidden when no src) */}
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          muted={muted}
          style={{ display: 'block' }}
          onVolumeChange={e => setVolume((e.target as HTMLVideoElement).volume)}
        />

        {/* Placeholder when no content */}
        {!hasContent && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none">
            {/* Animated gradient ring */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-forge-accent-violet/30 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-forge-accent-teal/30 flex items-center justify-center">
                  <Play size={20} className="text-forge-text-muted ml-0.5" />
                </div>
              </div>
              {/* Animated glow dot */}
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-forge-accent-violet animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-forge-text-secondary text-sm font-medium">Preview</p>
              <p className="text-forge-text-muted text-xs mt-0.5">
                Import media and add it to the timeline
              </p>
            </div>
          </div>
        )}

        {/* Playhead overlay */}
        {hasContent && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 rounded-full px-3 py-1 text-xs font-mono text-forge-text-primary">
            {timecode}
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex-shrink-0 bg-forge-bg-secondary border-t border-forge-border-subtle px-4 py-2 flex items-center gap-3">
        {/* Seek to start */}
        <button
          id="preview-seek-start"
          className="toolbar-btn p-1"
          onClick={handleSeekToStart}
          title="Go to start"
        >
          <SkipBack size={14} />
        </button>

        {/* Play / Pause */}
        <button
          id="preview-play-pause"
          onClick={handlePlayPause}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center transition-all',
            'bg-forge-gradient hover:opacity-90 shadow-forge-sm',
          )}
          title={playback.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playback.isPlaying
            ? <Pause size={14} className="text-white" />
            : <Play size={14} className="text-white ml-0.5" />
          }
        </button>

        {/* Seek to end */}
        <button
          id="preview-seek-end"
          className="toolbar-btn p-1"
          onClick={handleSeekToEnd}
          title="Go to end"
        >
          <SkipForward size={14} />
        </button>

        {/* Timecode */}
        <div className="flex items-center gap-1 text-xs font-mono text-forge-text-secondary">
          <span className="text-forge-text-primary">{timecode}</span>
          <span className="text-forge-text-muted">/</span>
          <span>{totalTimecode}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Volume */}
        <button
          id="preview-mute"
          className="toolbar-btn p-1"
          onClick={() => setMuted(!muted)}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={muted ? 0 : volume}
          onChange={e => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (videoRef.current) videoRef.current.volume = v;
            setMuted(v === 0);
          }}
          className="w-20 accent-forge-accent-violet"
          title="Volume"
        />

        {/* Fullscreen placeholder */}
        <button
          id="preview-fullscreen"
          className="toolbar-btn p-1"
          title="Fullscreen (not yet implemented)"
          disabled
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
