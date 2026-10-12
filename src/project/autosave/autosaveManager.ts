/**
 * ReelForge Studio — Autosave & Crash Recovery Engine
 *
 * Implements safe, non-destructive autosave and crash recovery.
 *
 * Guarantees:
 *   - Autosave snapshots are kept strictly separate from the user's chosen project file.
 *   - Never overwrites the user's destination file without explicit user command.
 *   - Never creates undo-history entries or marks the project as manually saved.
 *   - Protects against overlapping asynchronous writes and race conditions.
 *   - Cleans up recovery snapshots after a confirmed successful manual save.
 *   - Provides crash recovery prompt on application startup if a recovery snapshot exists.
 */

import type { Project } from '../schema/types';
import { serializeProject, deserializeProject } from '../serialization/projectSerializer';
import { isTauriEnvironment } from '../storage/projectStorage';

export const RECOVERY_STORAGE_KEY = 'reelforge_recovery_snapshot_v1';
export const RECOVERY_METADATA_KEY = 'reelforge_recovery_meta_v1';

export interface RecoverySnapshotMetadata {
  readonly timestamp: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly schemaVersion: number;
}

export interface RecoverySnapshot {
  readonly metadata: RecoverySnapshotMetadata;
  readonly project: Project;
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveManagerConfig {
  readonly debounceMs?: number;      // default: 2000ms
  readonly periodicIntervalMs?: number; // default: 30000ms
  readonly enabled?: boolean;
}

/**
 * Save recovery snapshot to persistent recovery storage.
 */
export async function saveRecoverySnapshot(project: Project): Promise<boolean> {
  const meta: RecoverySnapshotMetadata = {
    timestamp: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    schemaVersion: project.schemaVersion,
  };

  const jsonString = serializeProject(project);

  if (isTauriEnvironment()) {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      // In Tauri, store in local session recovery file
      const recoveryPath = 'reelforge_recovery_snapshot.rfproj';
      await fs.writeTextFile(recoveryPath, jsonString);
      await fs.writeTextFile('reelforge_recovery_meta.json', JSON.stringify(meta));
      return true;
    } catch {
      // Fallback to browser storage if Tauri fs fails
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(RECOVERY_STORAGE_KEY, jsonString);
      window.localStorage.setItem(RECOVERY_METADATA_KEY, JSON.stringify(meta));
      return true;
    } catch (err) {
      console.warn('Failed to write recovery snapshot to localStorage:', err);
      return false;
    }
  }

  return false;
}

/**
 * Check if a valid recovery snapshot exists.
 */
export async function getRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  if (isTauriEnvironment()) {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const recoveryPath = 'reelforge_recovery_snapshot.rfproj';
      const exists = await fs.exists(recoveryPath);
      if (exists) {
        const text = await fs.readTextFile(recoveryPath);
        const metaRaw = await fs.readTextFile('reelforge_recovery_meta.json');
        const meta = JSON.parse(metaRaw) as RecoverySnapshotMetadata;
        const result = deserializeProject(text);
        if (result.success) {
          return { metadata: meta, project: result.project };
        }
      }
    } catch {
      // Continue to check localStorage fallback
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const jsonString = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
      const metaRaw = window.localStorage.getItem(RECOVERY_METADATA_KEY);
      if (jsonString && metaRaw) {
        const meta = JSON.parse(metaRaw) as RecoverySnapshotMetadata;
        const result = deserializeProject(jsonString);
        if (result.success) {
          return { metadata: meta, project: result.project };
        }
      }
    } catch (err) {
      console.warn('Error reading recovery snapshot from localStorage:', err);
    }
  }

  return null;
}

/**
 * Remove recovery snapshot after a confirmed successful manual save or discard.
 */
export async function clearRecoverySnapshot(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      await fs.remove('reelforge_recovery_snapshot.rfproj');
      await fs.remove('reelforge_recovery_meta.json');
    } catch {
      // Ignore removal failure if files didn't exist
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(RECOVERY_STORAGE_KEY);
      window.localStorage.removeItem(RECOVERY_METADATA_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Autosave Coordinator managing debounce and periodic timers.
 */
export class AutosaveManager {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private isWriting = false;
  private debounceMs: number;
  private periodicIntervalMs: number;
  private enabled: boolean;

  private getProject: () => { project: Project; isDirty: boolean };
  private onStatusChange: (status: AutosaveStatus, lastSavedAt?: string) => void;

  constructor(
    getProject: () => { project: Project; isDirty: boolean },
    onStatusChange: (status: AutosaveStatus, lastSavedAt?: string) => void,
    config?: AutosaveManagerConfig
  ) {
    this.getProject = getProject;
    this.onStatusChange = onStatusChange;
    this.debounceMs = config?.debounceMs ?? 2000;
    this.periodicIntervalMs = config?.periodicIntervalMs ?? 30000;
    this.enabled = config?.enabled ?? true;

    this.startPeriodicTimer();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelDebounce();
      this.cancelPeriodic();
    } else {
      this.startPeriodicTimer();
    }
  }

  /**
   * Called whenever a user commits an edit to the project.
   * Debounces the snapshot save by debounceMs.
   */
  public notifyProjectChanged(): void {
    if (!this.enabled) return;

    this.cancelDebounce();
    this.debounceTimer = setTimeout(() => {
      void this.executeAutosave();
    }, this.debounceMs);
  }

  private startPeriodicTimer(): void {
    this.cancelPeriodic();
    if (!this.enabled) return;

    this.periodicTimer = setInterval(() => {
      const { isDirty } = this.getProject();
      if (isDirty) {
        void this.executeAutosave();
      }
    }, this.periodicIntervalMs);
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private cancelPeriodic(): void {
    if (this.periodicTimer !== null) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /**
   * Perform safe snapshot save. Guards against overlapping writes.
   */
  public async executeAutosave(): Promise<boolean> {
    if (this.isWriting) {
      return false; // Prevent concurrent overlapping snapshot writes
    }

    const { project, isDirty } = this.getProject();
    if (!isDirty) {
      return false;
    }

    this.isWriting = true;
    this.onStatusChange('saving');

    try {
      const success = await saveRecoverySnapshot(project);
      if (success) {
        const now = new Date().toISOString();
        this.onStatusChange('saved', now);
        return true;
      } else {
        this.onStatusChange('error');
        return false;
      }
    } catch {
      this.onStatusChange('error');
      return false;
    } finally {
      this.isWriting = false;
    }
  }

  public dispose(): void {
    this.cancelDebounce();
    this.cancelPeriodic();
  }
}
