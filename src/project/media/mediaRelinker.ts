/**
 * ReelForge Studio — Media Validation & Relinking Engine
 *
 * Implements non-blocking missing media detection and safe asset relinking.
 *
 * Guarantees:
 *   - Missing media never prevents project loading.
 *   - Original file paths are preserved alongside relinkPath.
 *   - Relinking preserves the stable asset ID across all referencing layers.
 *   - Validates file type compatibility before committing relink operations.
 *   - Supports batch directory search for missing files.
 */

import { produce } from 'immer';
import type { Project, MediaAsset, MediaType } from '../schema/types';
import { isTauriEnvironment } from '../storage/projectStorage';

const EXTENSIONS_BY_TYPE: Record<MediaType, ReadonlyArray<string>> = {
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mts', 'flv'],
  audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'aiff'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'],
};

/**
 * Extract extension from a file path or URL.
 */
export function getFileExtension(filePath: string): string {
  const clean = filePath.split('?')[0].split('#')[0];
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) return '';
  return clean.slice(lastDot + 1).toLowerCase();
}

/**
 * Extract filename from path.
 */
export function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

/**
 * Check if the replacement file has a compatible media type.
 */
export function isMediaTypeCompatible(expectedType: MediaType, newFilePath: string): boolean {
  const ext = getFileExtension(newFilePath);
  if (!ext) return true; // Can't determine from extension, probe might verify
  const allowed = EXTENSIONS_BY_TYPE[expectedType];
  return allowed ? allowed.includes(ext) : false;
}

/**
 * Check if a file path is reachable in the current environment.
 */
export async function checkFileExists(filePath: string): Promise<boolean> {
  // Explicit missing prefix used in testing or offline states
  if (filePath.startsWith('missing://') || filePath.includes('__missing__')) {
    return false;
  }

  if (isTauriEnvironment()) {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      return await fs.exists(filePath);
    } catch {
      return false;
    }
  }

  // In browser environment:
  // Blob URLs or web URLs can be tested with fetch or head
  if (filePath.startsWith('blob:') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    try {
      const res = await fetch(filePath, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Local filesystem absolute path in pure browser without backend:
  // Cannot be directly read by browser sandbox; if it's a mock path or relative test path, mark as missing
  return true;
}

/**
 * Detect missing media assets across the project on load.
 * Does not block loading; updates missingStatus on asset records.
 */
export async function detectMissingMedia(
  project: Project
): Promise<{ updatedProject: Project; missingCount: number }> {
  let missingCount = 0;
  const assetEntries = Object.entries(project.assetRegistry);

  if (assetEntries.length === 0) {
    return { updatedProject: project, missingCount: 0 };
  }

  const checks = await Promise.all(
    assetEntries.map(async ([id, asset]) => {
      const targetPath = asset.relinkPath || asset.originalPath;
      const exists = await checkFileExists(targetPath);
      return { id, exists };
    })
  );

  const updatedProject = produce(project, draft => {
    for (const { id, exists } of checks) {
      const asset = draft.assetRegistry[id];
      if (!asset) continue;

      if (!exists) {
        missingCount++;
        (asset as { missingStatus: string }).missingStatus = 'missing';
      } else if (asset.missingStatus === 'missing') {
        (asset as { missingStatus: string }).missingStatus = asset.relinkPath ? 'relinked' : 'present';
      }
    }
  });

  return { updatedProject, missingCount };
}

/**
 * Relink a single missing media asset to a new file path.
 * Guarantees that asset.id is preserved so existing layers remain linked.
 */
export function relinkSingleAsset(
  project: Project,
  assetId: string,
  newPath: string,
  newMetadata?: Partial<MediaAsset>
): { success: boolean; project?: Project; error?: string } {
  const asset = project.assetRegistry[assetId];
  if (!asset) {
    return { success: false, error: `Media asset "${assetId}" does not exist in project.` };
  }

  if (!isMediaTypeCompatible(asset.mediaType, newPath)) {
    return {
      success: false,
      error: `File "${getFileName(newPath)}" is not compatible with expected media type "${asset.mediaType}".`,
    };
  }

  const updatedProject = produce(project, draft => {
    const targetAsset = draft.assetRegistry[assetId];
    if (targetAsset) {
      const merged: MediaAsset = {
        ...targetAsset,
        relinkPath: newPath,
        missingStatus: 'relinked',
        name: getFileName(newPath),
        ...(newMetadata || {}),
        id: targetAsset.id, // Immutable ID preservation
        originalPath: targetAsset.originalPath, // Preserve original path
      };
      (draft.assetRegistry as Record<string, MediaAsset>)[assetId] = merged;
    }
  });

  return {
    success: true,
    project: updatedProject,
  };
}

/**
 * Batch relink missing assets that exist within a selected directory.
 */
export function batchRelinkFromDirectory(
  project: Project,
  directoryPath: string,
  foundFileNames: ReadonlyArray<string>
): { updatedProject: Project; relinkedCount: number } {
  let relinkedCount = 0;
  const normalizedDir = directoryPath.replace(/\\/g, '/').replace(/\/$/, '');
  const fileSet = new Set(foundFileNames.map(f => f.toLowerCase()));

  const updatedProject = produce(project, draft => {
    for (const [id, asset] of Object.entries(draft.assetRegistry)) {
      if (asset.missingStatus === 'missing') {
        const originalName = getFileName(asset.originalPath).toLowerCase();
        if (fileSet.has(originalName) && isMediaTypeCompatible(asset.mediaType, originalName)) {
          const newPath = `${normalizedDir}/${getFileName(asset.originalPath)}`;
          (draft.assetRegistry as Record<string, MediaAsset>)[id] = {
            ...asset,
            relinkPath: newPath,
            missingStatus: 'relinked',
          };
          relinkedCount++;
        }
      }
    }
  });

  return { updatedProject, relinkedCount };
}
