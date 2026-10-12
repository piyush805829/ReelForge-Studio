/**
 * ReelForge Studio — Unsaved Changes Confirmation Modal
 *
 * Prompts the user before discarding unsaved modifications during
 * New Project or Open Project operations.
 */

import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  projectName: string;
  onSaveAndContinue: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function UnsavedChangesModal({
  isOpen,
  projectName,
  onSaveAndContinue,
  onDiscard,
  onCancel,
}: UnsavedChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-forge-bg-secondary border border-forge-border-default rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-forge-status-warning/15 text-forge-status-warning flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 id="unsaved-modal-title" className="text-sm font-semibold text-forge-text-primary">
              Unsaved Changes
            </h3>
            <p className="text-xs text-forge-text-secondary mt-1 leading-relaxed">
              You have unsaved changes in project <span className="font-semibold text-forge-text-primary">"{projectName}"</span>.
              Do you want to save them before proceeding?
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-forge-border-subtle">
          <button
            id="unsaved-cancel-btn"
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-forge-text-secondary hover:text-forge-text-primary hover:bg-forge-bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            id="unsaved-discard-btn"
            type="button"
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-forge-status-error hover:bg-forge-status-error/15 transition-colors"
          >
            Discard Changes
          </button>
          <button
            id="unsaved-save-btn"
            type="button"
            onClick={onSaveAndContinue}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-forge-accent-violet hover:bg-forge-accent-hover text-white transition-colors shadow-sm"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
