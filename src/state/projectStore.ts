/**
 * ReelForge Studio — Project Store (Zustand)
 *
 * This is the single global store for the project state.
 * All mutations MUST go through the CommandHistory.execute() mechanism.
 * Direct project state mutation from UI components is forbidden.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { createDefaultProject, type Project, type StableId } from '../project/schema/types';
import { CommandHistory, type CommandFn } from '../timeline/history/commandHistory';
import type { CommandResult } from '../timeline/commands/timelineCommands';
import {
  saveProject as saveProjectStorage,
  openProject as openProjectStorage,
} from '../project/storage/projectStorage';
import {
  AutosaveManager,
  clearRecoverySnapshot,
} from '../project/autosave/autosaveManager';
import {
  detectMissingMedia,
  relinkSingleAsset,
  batchRelinkFromDirectory,
} from '../project/media/mediaRelinker';

// ─── Playback State ───────────────────────────────────────────────────────────

export interface PlaybackState {
  isPlaying: boolean;
  currentTicks: number;
  /** ID of the composition currently shown in the main preview */
  activeCompositionId: StableId;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export type WorkspaceId = 'quick-edit' | 'motion-studio' | 'pro-finishing' | 'ai-assistant';

export interface UIState {
  activeWorkspace: WorkspaceId;
  selectedLayerIds: Set<StableId>;
  /** Timeline zoom: pixels per tick */
  timelinePixelsPerTick: number;
  /** Timeline scroll offset in pixels */
  timelineScrollOffsetPx: number;
  /** Whether the inspector panel is visible */
  inspectorVisible: boolean;
  /** Whether the media bin panel is visible */
  mediaBinVisible: boolean;
}

// ─── App Flags ────────────────────────────────────────────────────────────────

export interface AppFlags {
  hasUnsavedChanges: boolean;
  isExporting: boolean;
  exportProgress: number; // 0–1
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastAutosaveAt?: string;
  missingMediaCount: number;
}

// ─── Store Shape ─────────────────────────────────────────────────────────────

export interface ProjectStore {
  // Core
  project: Project;
  history: CommandHistory;

  // Derived
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | undefined;
  redoLabel: string | undefined;

  // Playback
  playback: PlaybackState;

  // UI
  ui: UIState;

  // App
  flags: AppFlags;

  // Actions
  execute: <T = unknown>(commandName: string, fn: CommandFn<T>) => CommandResult<T>;
  undo: () => void;
  redo: () => void;

  setPlayback: (patch: Partial<PlaybackState>) => void;
  setUI: (patch: Partial<UIState>) => void;
  setFlags: (patch: Partial<AppFlags>) => void;

  newProject: (name?: string) => void;
  replaceProject: (project: Project) => void;

  // Persistence Actions
  saveCurrentProject: (options?: { saveAs?: boolean }) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
  openProjectFromDisk: () => Promise<{ success: boolean; cancelled?: boolean; error?: string; missingCount?: number }>;
  relinkAsset: (assetId: StableId, newPath: string) => boolean;
  batchRelinkAssets: (dirPath: string, files: string[]) => number;

  selectLayer: (layerId: StableId | null, multiSelect?: boolean) => void;
  clearSelection: () => void;
}

// ─── Store Factory ────────────────────────────────────────────────────────────

function makeNewProject(name = 'Untitled Project'): { project: Project; history: CommandHistory } {
  const id = uuidv4();
  const mainCompId = uuidv4();
  const project = createDefaultProject(name, id, mainCompId);
  const history = new CommandHistory(project);
  return { project, history };
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const { project: initialProject, history: initialHistory } = makeNewProject();

  return {
    project: initialProject,
    history: initialHistory,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,

    playback: {
      isPlaying:           false,
      currentTicks:        0,
      activeCompositionId: initialProject.mainCompositionId,
    },

    ui: {
      activeWorkspace:        'quick-edit',
      selectedLayerIds:       new Set(),
      timelinePixelsPerTick:  0.001, // ~240px per second at default zoom
      timelineScrollOffsetPx: 0,
      inspectorVisible:       true,
      mediaBinVisible:        true,
    },

    flags: {
      hasUnsavedChanges: false,
      isExporting:       false,
      exportProgress:    0,
      autosaveStatus:    'idle',
      missingMediaCount: 0,
    },

    execute<T = unknown>(commandName: string, fn: CommandFn<T>): CommandResult<T> {
      const { history } = get();
      const result = history.execute(commandName, fn);
      if (result.ok) {
        set({
          project:   history.current,
          canUndo:   history.canUndo,
          canRedo:   history.canRedo,
          undoLabel: history.undoLabel,
          redoLabel: history.redoLabel,
          flags:     { ...get().flags, hasUnsavedChanges: true },
        });
        autosaveManager.notifyProjectChanged();
      }
      return result;
    },

    undo() {
      const { history } = get();
      if (history.undo()) {
        set({
          project:   history.current,
          canUndo:   history.canUndo,
          canRedo:   history.canRedo,
          undoLabel: history.undoLabel,
          redoLabel: history.redoLabel,
          flags:     { ...get().flags, hasUnsavedChanges: true },
        });
        autosaveManager.notifyProjectChanged();
      }
    },

    redo() {
      const { history } = get();
      if (history.redo()) {
        set({
          project:   history.current,
          canUndo:   history.canUndo,
          canRedo:   history.canRedo,
          undoLabel: history.undoLabel,
          redoLabel: history.redoLabel,
          flags:     { ...get().flags, hasUnsavedChanges: true },
        });
        autosaveManager.notifyProjectChanged();
      }
    },

    setPlayback(patch) {
      set(state => ({ playback: { ...state.playback, ...patch } }));
    },

    setUI(patch) {
      set(state => ({ ui: { ...state.ui, ...patch } }));
    },

    setFlags(patch) {
      set(state => ({ flags: { ...state.flags, ...patch } }));
    },

    newProject(name) {
      const { project, history } = makeNewProject(name);
      set({
        project,
        history,
        canUndo: false,
        canRedo: false,
        undoLabel: undefined,
        redoLabel: undefined,
        playback: {
          isPlaying:           false,
          currentTicks:        0,
          activeCompositionId: project.mainCompositionId,
        },
        flags: {
          hasUnsavedChanges: false,
          isExporting:       false,
          exportProgress:    0,
          autosaveStatus:    'idle',
          missingMediaCount: 0,
        },
      });
    },

    replaceProject(project) {
      const { history } = get();
      history.replaceWithoutHistory(project);
      const missingCount = Object.values(project.assetRegistry).filter(
        a => a.missingStatus === 'missing'
      ).length;

      set({
        project,
        history,
        canUndo: false,
        canRedo: false,
        undoLabel: undefined,
        redoLabel: undefined,
        playback: {
          isPlaying:           false,
          currentTicks:        0,
          activeCompositionId: project.mainCompositionId,
        },
        flags: {
          hasUnsavedChanges: false,
          isExporting:       false,
          exportProgress:    0,
          autosaveStatus:    'idle',
          missingMediaCount: missingCount,
        },
      });
    },

    async saveCurrentProject(options) {
      const { project } = get();
      set(state => ({ flags: { ...state.flags, autosaveStatus: 'saving' } }));

      const res = await saveProjectStorage(project, options);
      if (res.success && res.data) {
        set(state => ({
          project: res.data!,
          flags: {
            ...state.flags,
            hasUnsavedChanges: false,
            autosaveStatus: 'saved',
            lastAutosaveAt: new Date().toISOString(),
          },
        }));
        await clearRecoverySnapshot();
        return { success: true };
      } else if (res.cancelled) {
        set(state => ({ flags: { ...state.flags, autosaveStatus: 'idle' } }));
        return { success: false, cancelled: true };
      } else {
        // Failed write preserves dirty flag
        set(state => ({ flags: { ...state.flags, autosaveStatus: 'error' } }));
        return { success: false, error: res.error };
      }
    },

    async openProjectFromDisk() {
      const res = await openProjectStorage();
      if (res.success && res.data) {
        const { updatedProject, missingCount } = await detectMissingMedia(res.data);
        get().replaceProject(updatedProject);
        return { success: true, missingCount };
      } else if (res.cancelled) {
        return { success: false, cancelled: true };
      } else {
        return { success: false, error: res.error };
      }
    },

    relinkAsset(assetId, newPath) {
      const { project, history } = get();
      const res = relinkSingleAsset(project, assetId, newPath);
      if (res.success && res.project) {
        history.replaceWithoutHistory(res.project);
        const missingCount = Object.values(res.project.assetRegistry).filter(
          a => a.missingStatus === 'missing'
        ).length;
        set(state => ({
          project: res.project!,
          flags: {
            ...state.flags,
            hasUnsavedChanges: true,
            missingMediaCount: missingCount,
          },
        }));
        autosaveManager.notifyProjectChanged();
        return true;
      }
      return false;
    },

    batchRelinkAssets(dirPath, files) {
      const { project, history } = get();
      const res = batchRelinkFromDirectory(project, dirPath, files);
      if (res.relinkedCount > 0) {
        history.replaceWithoutHistory(res.updatedProject);
        const missingCount = Object.values(res.updatedProject.assetRegistry).filter(
          a => a.missingStatus === 'missing'
        ).length;
        set(state => ({
          project: res.updatedProject,
          flags: {
            ...state.flags,
            hasUnsavedChanges: true,
            missingMediaCount: missingCount,
          },
        }));
        autosaveManager.notifyProjectChanged();
      }
      return res.relinkedCount;
    },

    selectLayer(layerId, multiSelect = false) {
      set(state => {
        const next = new Set(state.ui.selectedLayerIds);
        if (layerId === null) {
          next.clear();
        } else if (multiSelect) {
          if (next.has(layerId)) next.delete(layerId);
          else next.add(layerId);
        } else {
          next.clear();
          next.add(layerId);
        }
        return { ui: { ...state.ui, selectedLayerIds: next } };
      });
    },

    clearSelection() {
      set(state => ({ ui: { ...state.ui, selectedLayerIds: new Set() } }));
    },
  };
});

// ─── Autosave Manager Instance ───────────────────────────────────────────────

export const autosaveManager = new AutosaveManager(
  () => ({
    project: useProjectStore.getState().project,
    isDirty: useProjectStore.getState().flags.hasUnsavedChanges,
  }),
  (status, lastSavedAt) => {
    useProjectStore.getState().setFlags({
      autosaveStatus: status,
      ...(lastSavedAt ? { lastAutosaveAt: lastSavedAt } : {}),
    });
  }
);

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Get the main composition */
export function selectMainComposition(store: ProjectStore) {
  return store.project.compositionRegistry[store.project.mainCompositionId];
}

/** Get the active composition (same as main for now) */
export function selectActiveComposition(store: ProjectStore) {
  return store.project.compositionRegistry[store.playback.activeCompositionId];
}

/** Get all layers for the active composition in z-order */
export function selectOrderedLayers(store: ProjectStore) {
  const comp = selectActiveComposition(store);
  if (!comp) return [];
  return comp.orderedLayerIds
    .map(id => comp.layers[id])
    .filter(Boolean);
}

/** Get all assets as an array */
export function selectAllAssets(store: ProjectStore) {
  return Object.values(store.project.assetRegistry);
}
