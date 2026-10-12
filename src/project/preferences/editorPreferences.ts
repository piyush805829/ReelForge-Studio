/**
 * ReelForge Studio — Editor Preferences vs Project Settings
 *
 * Defines the strict separation between:
 *   1. Project Data (.rfproj):
 *      - Authoritative creative state: compositions, layers, keyframes, transforms,
 *        effects, audio settings, assets, canvas dimensions, timebases, export defaults.
 *      - Stored in versioned JSON file.
 *
 *   2. Application Preferences (local config):
 *      - User environment preferences: theme, recent files list, autosave intervals,
 *        timeline snapping threshold, hardware acceleration settings.
 *      - Stored separately in local storage / app config, NEVER inside .rfproj.
 *
 *   3. Ephemeral UI State (session runtime):
 *      - Active playhead position, selection, zoom level, scroll offset, drag previews.
 *      - Maintained only in React/Zustand memory during the active session.
 */

export interface EditorPreferences {
  readonly theme: 'dark' | 'light' | 'system';
  readonly autosaveEnabled: boolean;
  readonly autosaveIntervalSeconds: number; // default: 30
  readonly autosaveDebounceMs: number;       // default: 2000
  readonly snappingThresholdPx: number;      // default: 8
  readonly recentProjects: ReadonlyArray<RecentProjectEntry>;
}

export interface RecentProjectEntry {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: string; // ISO 8601
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  theme: 'dark',
  autosaveEnabled: true,
  autosaveIntervalSeconds: 30,
  autosaveDebounceMs: 2000,
  snappingThresholdPx: 8,
  recentProjects: [],
};

const PREFERENCES_STORAGE_KEY = 'reelforge_editor_preferences_v1';

export function loadEditorPreferences(): EditorPreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_EDITOR_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_PREFERENCES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_EDITOR_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function saveEditorPreferences(prefs: Partial<EditorPreferences>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    const current = loadEditorPreferences();
    const updated = { ...current, ...prefs };
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save editor preferences to localStorage:', err);
  }
}
