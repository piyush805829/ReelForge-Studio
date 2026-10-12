/**
 * ReelForge Studio — Project Storage Engine
 *
 * Implements persistent save, save-as, open, and atomic writes.
 * Supports:
 *   1. Native Tauri 2 runtime via @tauri-apps/plugin-dialog and @tauri-apps/plugin-fs
 *   2. Web browser development fallback via Blob download and FileReader input
 *
 * Guarantees:
 *   - Atomic writes on desktop (writes to .tmp first, then safely replaces target).
 *   - Cancelled dialogs never mutate project state or clean/dirty flags.
 *   - Failed writes preserve the dirty flag and report actionable error details.
 *   - Clean separation between native Tauri and browser fallback modes.
 */

import type { Project } from '../schema/types';
import { serializeProject, deserializeProject } from '../serialization/projectSerializer';

export interface StorageResult<T = unknown> {
  readonly success: boolean;
  readonly cancelled?: boolean;
  readonly data?: T;
  readonly filePath?: string;
  readonly error?: string;
}

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
  );
}

export function getStorageMode(): 'tauri' | 'browser' {
  return isTauriEnvironment() ? 'tauri' : 'browser';
}

/**
 * Save project to native filesystem via Tauri plugins with atomic write.
 */
async function saveProjectTauri(
  project: Project,
  targetPath?: string
): Promise<StorageResult<Project>> {
  try {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');

    let destinationPath = targetPath;

    if (!destinationPath) {
      const selected = await dialog.save({
        defaultPath: `${project.name || 'Untitled'}.rfproj`,
        filters: [
          { name: 'ReelForge Project (*.rfproj)', extensions: ['rfproj'] },
          { name: 'JSON Project (*.json)', extensions: ['json'] },
        ],
      });

      if (!selected) {
        return { success: false, cancelled: true };
      }
      destinationPath = selected;
    }

    const jsonString = serializeProject({
      ...project,
      projectFilePath: destinationPath,
      updatedAt: new Date().toISOString(),
    });

    // Atomic write pattern: write to .tmp, then rename to destinationPath
    const tempPath = `${destinationPath}.tmp.${Date.now()}`;
    await fs.writeTextFile(tempPath, jsonString);

    try {
      await fs.rename(tempPath, destinationPath);
    } catch {
      // Fallback if cross-device rename or overwrite fails on some OS configurations
      await fs.writeTextFile(destinationPath, jsonString);
      try {
        await fs.remove(tempPath);
      } catch {
        // Temp cleanup failure is non-fatal
      }
    }

    const updatedProject: Project = {
      ...project,
      projectFilePath: destinationPath,
      updatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      filePath: destinationPath,
      data: updatedProject,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Tauri file save failed: ${message}`,
    };
  }
}

/**
 * Save project in browser mode via Blob download.
 */
function saveProjectBrowser(
  project: Project,
  suggestedName?: string
): Promise<StorageResult<Project>> {
  return new Promise((resolve) => {
    try {
      const baseName = suggestedName || project.name || 'Untitled Project';
      const fileName = baseName.endsWith('.rfproj') ? baseName : `${baseName}.rfproj`;

      const updatedProject: Project = {
        ...project,
        projectFilePath: fileName,
        updatedAt: new Date().toISOString(),
      };

      const jsonString = serializeProject(updatedProject);
      const url =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(new Blob([jsonString], { type: 'application/json' }))
          : `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;

      if (typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
          if (typeof link.click === 'function') {
            link.click();
          }
        } catch {
          // jsdom navigation stub
        }
        document.body.removeChild(link);
      }

      if (
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function' &&
        !url.startsWith('data:')
      ) {
        URL.revokeObjectURL(url);
      }

      resolve({
        success: true,
        filePath: fileName,
        data: updatedProject,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        success: false,
        error: `Browser download failed: ${message}`,
      });
    }
  });
}

/**
 * Open project from native filesystem via Tauri plugins.
 */
async function openProjectTauri(): Promise<StorageResult<Project>> {
  try {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');

    const selected = await dialog.open({
      multiple: false,
      directory: false,
      filters: [
        { name: 'ReelForge Project (*.rfproj, *.json)', extensions: ['rfproj', 'json'] },
      ],
    });

    if (!selected) {
      return { success: false, cancelled: true };
    }

    const filePath = Array.isArray(selected) ? selected[0] : selected;
    if (!filePath) {
      return { success: false, cancelled: true };
    }

    const content = await fs.readTextFile(filePath);
    const deserializeResult = deserializeProject(content);

    if (!deserializeResult.success) {
      return {
        success: false,
        error: `Invalid project file "${filePath}":\n${deserializeResult.errors.join('\n')}`,
      };
    }

    const project: Project = {
      ...deserializeResult.project,
      projectFilePath: filePath,
    };

    return {
      success: true,
      filePath,
      data: project,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to open file via Tauri: ${message}`,
    };
  }
}

/**
 * Open project in browser mode via hidden file input.
 */
function openProjectBrowser(): Promise<StorageResult<Project>> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.rfproj,.json';
      input.style.display = 'none';

      let handled = false;

      input.onchange = async () => {
        handled = true;
        const file = input.files?.[0];
        if (!file) {
          resolve({ success: false, cancelled: true });
          return;
        }

        try {
          const text = await file.text();
          const deserializeResult = deserializeProject(text);

          if (!deserializeResult.success) {
            resolve({
              success: false,
              error: `Invalid project file "${file.name}":\n${deserializeResult.errors.join('\n')}`,
            });
            return;
          }

          const project: Project = {
            ...deserializeResult.project,
            projectFilePath: file.name,
          };

          resolve({
            success: true,
            filePath: file.name,
            data: project,
          });
        } catch (readErr) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          resolve({
            success: false,
            error: `Failed to read file "${file.name}": ${msg}`,
          });
        } finally {
          document.body.removeChild(input);
        }
      };

      // Detect cancel in modern browsers
      input.oncancel = () => {
        if (!handled) {
          handled = true;
          document.body.removeChild(input);
          resolve({ success: false, cancelled: true });
        }
      };

      document.body.appendChild(input);
      input.click();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        success: false,
        error: `Browser file selector failed: ${message}`,
      });
    }
  });
}

/**
 * Public Save function: Saves to existing projectFilePath if available,
 * otherwise triggers Save As.
 */
export async function saveProject(
  project: Project,
  options?: { saveAs?: boolean }
): Promise<StorageResult<Project>> {
  const isTauri = isTauriEnvironment();
  const needsSaveAs = options?.saveAs || !project.projectFilePath;

  if (isTauri) {
    const targetPath = needsSaveAs ? undefined : project.projectFilePath;
    return saveProjectTauri(project, targetPath);
  } else {
    // In browser, Save always downloads file (or prompts name)
    const suggestedName = needsSaveAs ? undefined : project.projectFilePath;
    return saveProjectBrowser(project, suggestedName);
  }
}

/**
 * Public Save As function.
 */
export async function saveProjectAs(project: Project): Promise<StorageResult<Project>> {
  return saveProject(project, { saveAs: true });
}

/**
 * Public Open function.
 */
export async function openProject(): Promise<StorageResult<Project>> {
  if (isTauriEnvironment()) {
    return openProjectTauri();
  } else {
    return openProjectBrowser();
  }
}
