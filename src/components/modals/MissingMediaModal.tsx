/**
 * ReelForge Studio — Missing Media Management Modal
 *
 * Displays missing assets, permits individual relinking with type validation,
 * and preserves asset IDs so timeline layers remain linked.
 */

import { useState } from 'react';
import { AlertCircle, FileSearch, CheckCircle2, X, FolderSync } from 'lucide-react';
import { useProjectStore } from '../../state/projectStore';
import { getFileName, isMediaTypeCompatible } from '../../project/media/mediaRelinker';
import { isTauriEnvironment } from '../../project/storage/projectStorage';

interface MissingMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MissingMediaModal({ isOpen, onClose }: MissingMediaModalProps) {
  const project = useProjectStore(state => state.project);
  const relinkAsset = useProjectStore(state => state.relinkAsset);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const missingAssets = Object.values(project.assetRegistry).filter(
    a => a.missingStatus === 'missing'
  );

  const handlePickReplacement = async (assetId: string) => {
    setErrorMessage(null);
    const targetAsset = project.assetRegistry[assetId];
    if (!targetAsset) return;

    if (isTauriEnvironment()) {
      try {
        const dialog = await import('@tauri-apps/plugin-dialog');
        const selected = await dialog.open({
          multiple: false,
          filters: [
            { name: `${targetAsset.mediaType.toUpperCase()} Files`, extensions: ['mp4', 'mov', 'mkv', 'mp3', 'wav', 'png', 'jpg', 'jpeg'] },
          ],
        });
        if (selected) {
          const filePath = Array.isArray(selected) ? selected[0] : selected;
          if (filePath) {
            if (!isMediaTypeCompatible(targetAsset.mediaType, filePath)) {
              setErrorMessage(`Selected file is not compatible with ${targetAsset.mediaType} media.`);
              return;
            }
            relinkAsset(assetId, filePath);
          }
        }
      } catch (err) {
        setErrorMessage(`Tauri dialog error: ${String(err)}`);
      }
      return;
    }

    // Browser fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = targetAsset.mediaType === 'video' ? 'video/*' : targetAsset.mediaType === 'audio' ? 'audio/*' : 'image/*';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        if (!isMediaTypeCompatible(targetAsset.mediaType, file.name)) {
          setErrorMessage(`File "${file.name}" is incompatible with expected ${targetAsset.mediaType} asset.`);
          return;
        }
        relinkAsset(assetId, file.name);
      }
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-media-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="bg-forge-bg-secondary border border-forge-border-default rounded-xl w-full max-w-xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-forge-status-warning/15 text-forge-status-warning">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 id="missing-media-title" className="text-sm font-semibold text-forge-text-primary">
                Missing Media Assets ({missingAssets.length})
              </h3>
              <p className="text-xxs text-forge-text-secondary">
                The project opened successfully, but some media files could not be located.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-forge-text-muted hover:text-forge-text-primary hover:bg-forge-bg-elevated transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-forge-status-error/15 border border-forge-status-error/30 text-forge-status-error text-xs">
            {errorMessage}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {missingAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={32} className="text-forge-status-success mb-2" />
              <p className="text-xs text-forge-text-primary font-medium">All media assets are linked!</p>
              <p className="text-xxs text-forge-text-muted mt-0.5">Timeline layers are ready for editing.</p>
            </div>
          ) : (
            missingAssets.map(asset => (
              <div
                key={asset.id}
                className="flex items-center justify-between p-3 rounded-lg bg-forge-bg-elevated/80 border border-forge-border-subtle"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-forge-text-primary truncate">
                      {asset.name || getFileName(asset.originalPath)}
                    </span>
                    <span className="text-3xs uppercase font-mono px-1.5 py-0.5 rounded bg-forge-status-warning/20 text-forge-status-warning">
                      {asset.mediaType}
                    </span>
                  </div>
                  <p className="text-3xs text-forge-text-muted font-mono truncate mt-0.5" title={asset.originalPath}>
                    Original: {asset.originalPath}
                  </p>
                </div>
                <button
                  onClick={() => handlePickReplacement(asset.id)}
                  className="px-2.5 py-1.5 rounded text-xs font-medium bg-forge-accent-violet hover:bg-forge-accent-hover text-white transition-colors flex items-center gap-1 flex-shrink-0 shadow-sm"
                >
                  <FileSearch size={12} />
                  Relink
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-forge-border-subtle text-xxs text-forge-text-muted">
          <div className="flex items-center gap-1.5">
            <FolderSync size={13} />
            <span>Relinking preserves all cut points, keyframes, and effects.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-forge-bg-elevated text-forge-text-primary hover:bg-forge-bg-active transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
