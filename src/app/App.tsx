/**
 * ReelForge Studio — Root App Component
 * Handles global keyboard shortcuts, persistence workflows, recovery, and modals.
 */

import { useEffect, useState, useCallback } from 'react';
import AppShell from '../components/layout/AppShell';
import { useProjectStore } from '../state/projectStore';
import { cmdSplitLayer, cmdDeleteLayer } from '../timeline/commands/timelineCommands';
import {
  getRecoverySnapshot,
  clearRecoverySnapshot,
  type RecoverySnapshot,
} from '../project/autosave/autosaveManager';
import UnsavedChangesModal from '../components/modals/UnsavedChangesModal';
import RecoveryPromptModal from '../components/modals/RecoveryPromptModal';
import MissingMediaModal from '../components/modals/MissingMediaModal';

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export default function App() {
  const undo = useProjectStore(state => state.undo);
  const redo = useProjectStore(state => state.redo);
  const canUndo = useProjectStore(state => state.canUndo);
  const canRedo = useProjectStore(state => state.canRedo);
  const execute = useProjectStore(state => state.execute);
  const selectLayer = useProjectStore(state => state.selectLayer);
  const clearSelection = useProjectStore(state => state.clearSelection);
  const setPlayback = useProjectStore(state => state.setPlayback);
  const project = useProjectStore(state => state.project);
  const playback = useProjectStore(state => state.playback);
  const flags = useProjectStore(state => state.flags);
  const selectedLayerIds = useProjectStore(state => state.ui.selectedLayerIds);
  const newProject = useProjectStore(state => state.newProject);
  const replaceProject = useProjectStore(state => state.replaceProject);
  const saveCurrentProject = useProjectStore(state => state.saveCurrentProject);
  const openProjectFromDisk = useProjectStore(state => state.openProjectFromDisk);

  // Modal states
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'new' | 'open' | null>(null);

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoverySnapshot, setRecoverySnapshot] = useState<RecoverySnapshot | null>(null);

  const [showMissingMediaModal, setShowMissingMediaModal] = useState(false);

  // Check for crash recovery snapshot on initial startup
  useEffect(() => {
    void (async () => {
      try {
        const snapshot = await getRecoverySnapshot();
        if (snapshot) {
          setRecoverySnapshot(snapshot);
          setShowRecoveryModal(true);
        }
      } catch (err) {
        console.warn('Failed to check recovery snapshot on launch:', err);
      }
    })();
  }, []);

  // Browser beforeunload prompt if project has unsaved edits
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (flags.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flags.hasUnsavedChanges]);

  // Actions
  const handleRequestNew = useCallback(() => {
    if (flags.hasUnsavedChanges) {
      setPendingAction('new');
      setShowUnsavedModal(true);
    } else {
      newProject();
    }
  }, [flags.hasUnsavedChanges, newProject]);

  const executeOpenFlow = useCallback(async () => {
    const res = await openProjectFromDisk();
    if (res.success && res.missingCount && res.missingCount > 0) {
      setShowMissingMediaModal(true);
    }
  }, [openProjectFromDisk]);

  const handleRequestOpen = useCallback(() => {
    if (flags.hasUnsavedChanges) {
      setPendingAction('open');
      setShowUnsavedModal(true);
    } else {
      void executeOpenFlow();
    }
  }, [flags.hasUnsavedChanges, executeOpenFlow]);

  const handleSave = useCallback(async () => {
    await saveCurrentProject();
  }, [saveCurrentProject]);

  const handleSaveAs = useCallback(async () => {
    await saveCurrentProject({ saveAs: true });
  }, [saveCurrentProject]);

  // Modal resolution
  const handleUnsavedSaveAndContinue = useCallback(async () => {
    setShowUnsavedModal(false);
    const saveRes = await saveCurrentProject();
    if (saveRes.success) {
      if (pendingAction === 'new') {
        newProject();
      } else if (pendingAction === 'open') {
        await executeOpenFlow();
      }
    }
    setPendingAction(null);
  }, [saveCurrentProject, pendingAction, newProject, executeOpenFlow]);

  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedModal(false);
    if (pendingAction === 'new') {
      newProject();
    } else if (pendingAction === 'open') {
      void executeOpenFlow();
    }
    setPendingAction(null);
  }, [pendingAction, newProject, executeOpenFlow]);

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedModal(false);
    setPendingAction(null);
  }, []);

  const handleRestoreRecovery = useCallback(() => {
    if (recoverySnapshot) {
      replaceProject(recoverySnapshot.project);
    }
    setShowRecoveryModal(false);
    setRecoverySnapshot(null);
  }, [recoverySnapshot, replaceProject]);

  const handleDiscardRecovery = useCallback(() => {
    void clearRecoverySnapshot();
    setShowRecoveryModal(false);
    setRecoverySnapshot(null);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputElement(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Play / Pause transport toggle
      if (e.code === 'Space' && !ctrl && !e.altKey) {
        e.preventDefault();
        setPlayback({ isPlaying: !playback.isPlaying });
        return;
      }

      // Delete selected clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl && !e.altKey) {
        if (selectedLayerIds.size > 0) {
          e.preventDefault();
          const compId = playback.activeCompositionId;
          const ids = Array.from(selectedLayerIds);
          for (const id of ids) {
            execute('Delete Clip', draft =>
              cmdDeleteLayer(draft, { compositionId: compId, layerId: id })
            );
          }
          clearSelection();
          return;
        }
      }

      if (!ctrl) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          if (e.shiftKey) {
            void handleSaveAs();
          } else {
            void handleSave();
          }
          break;

        case 'o':
          e.preventDefault();
          handleRequestOpen();
          break;

        case 'n':
          e.preventDefault();
          handleRequestNew();
          break;

        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            if (canRedo) redo();
          } else {
            if (canUndo) undo();
          }
          break;

        case 'y':
          e.preventDefault();
          if (canRedo) redo();
          break;

        case 'b':
          // Split selected clip at playhead (Razor action)
          if (selectedLayerIds.size === 1) {
            const compId = playback.activeCompositionId;
            const comp = project.compositionRegistry[compId];
            const selectedId = Array.from(selectedLayerIds)[0];
            const layer = comp?.layers[selectedId];
            if (layer) {
              const layerEnd = layer.timelineStartTicks + layer.timelineDurationTicks;
              if (playback.currentTicks > layer.timelineStartTicks && playback.currentTicks < layerEnd) {
                e.preventDefault();
                const res = execute('Split Clip at Playhead', draft =>
                  cmdSplitLayer(draft, {
                    compositionId: compId,
                    layerId: selectedId,
                    splitTimeTicks: playback.currentTicks,
                  })
                );
                if (res.ok && res.value) {
                  selectLayer(res.value.rightLayerId, false);
                }
              }
            }
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    execute,
    selectLayer,
    clearSelection,
    setPlayback,
    project,
    playback,
    selectedLayerIds,
    handleSave,
    handleSaveAs,
    handleRequestOpen,
    handleRequestNew,
  ]);

  return (
    <>
      <AppShell
        toolbarProps={{
          onNewRequest: handleRequestNew,
          onOpenRequest: handleRequestOpen,
          onSaveRequest: () => { void handleSave(); },
          onSaveAsRequest: () => { void handleSaveAs(); },
          onMissingMediaRequest: () => setShowMissingMediaModal(true),
        }}
      />

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        projectName={project.name}
        onSaveAndContinue={() => { void handleUnsavedSaveAndContinue(); }}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
      />

      {/* Startup Crash Recovery Dialog */}
      <RecoveryPromptModal
        isOpen={showRecoveryModal}
        snapshot={recoverySnapshot}
        onRecover={handleRestoreRecovery}
        onDiscard={handleDiscardRecovery}
      />

      {/* Missing Media Inspection & Relink Dialog */}
      <MissingMediaModal
        isOpen={showMissingMediaModal}
        onClose={() => setShowMissingMediaModal(false)}
      />
    </>
  );
}
