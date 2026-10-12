/**
 * ReelForge Studio — Crash Recovery Prompt Modal
 *
 * Prompts user on startup when an unsaved recovery snapshot is detected.
 */

import { RotateCcw, Clock, ShieldAlert } from 'lucide-react';
import type { RecoverySnapshot } from '../../project/autosave/autosaveManager';

interface RecoveryPromptModalProps {
  isOpen: boolean;
  snapshot: RecoverySnapshot | null;
  onRecover: () => void;
  onDiscard: () => void;
}

export default function RecoveryPromptModal({
  isOpen,
  snapshot,
  onRecover,
  onDiscard,
}: RecoveryPromptModalProps) {
  if (!isOpen || !snapshot) return null;

  const formattedDate = new Date(snapshot.metadata.timestamp).toLocaleString();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-forge-bg-secondary border border-forge-border-default rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-forge-accent-violet/15 text-forge-accent-violet flex-shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3 id="recovery-modal-title" className="text-sm font-semibold text-forge-text-primary">
              Restore Unsaved Work
            </h3>
            <p className="text-xs text-forge-text-secondary mt-1 leading-relaxed">
              ReelForge Studio found an autosaved session snapshot for{' '}
              <span className="font-semibold text-forge-text-primary">"{snapshot.metadata.projectName}"</span> from an unexpected application closure.
            </p>
          </div>
        </div>

        <div className="bg-forge-bg-elevated/70 border border-forge-border-subtle rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xxs text-forge-text-muted">
            <Clock size={12} />
            <span>Captured at: <strong className="text-forge-text-secondary">{formattedDate}</strong></span>
          </div>
          <div className="text-xxs text-forge-text-muted">
            <span>Layers & Compositions: <strong className="text-forge-text-secondary">{Object.keys(snapshot.project.compositionRegistry).length} composition(s)</strong></span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-forge-border-subtle">
          <button
            id="recovery-discard-btn"
            type="button"
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-forge-text-secondary hover:text-forge-text-primary hover:bg-forge-bg-elevated transition-colors"
          >
            Discard Snapshot
          </button>
          <button
            id="recovery-restore-btn"
            type="button"
            onClick={onRecover}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-forge-accent-violet hover:bg-forge-accent-hover text-white transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RotateCcw size={12} />
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
}
