/**
 * ReelForge Studio — Top Toolbar
 *
 * Contains: app logo, workspace selector, project controls (new/open/save/save as),
 * undo/redo, autosave status, missing media indicators, export button.
 */

import { useCallback } from 'react';
import {
  Film,
  Layers,
  Sliders,
  Sparkles,
  Undo2,
  Redo2,
  FolderOpen,
  Save,
  Download,
  PanelLeft,
  PanelRight,
  Plus,
  AlertTriangle,
  HardDrive,
  Globe,
  FilePlus2,
} from 'lucide-react';
import { useProjectStore, type WorkspaceId } from '../../state/projectStore';
import { isTauriEnvironment } from '../../project/storage/projectStorage';
import { cn } from '../../lib/utils';

const WORKSPACES: { id: WorkspaceId; label: string; icon: React.ElementType }[] = [
  { id: 'quick-edit',     label: 'Quick Edit',    icon: Film     },
  { id: 'motion-studio',  label: 'Motion Studio', icon: Layers   },
  { id: 'pro-finishing',  label: 'Finishing',     icon: Sliders  },
  { id: 'ai-assistant',   label: 'AI',            icon: Sparkles },
];

export interface TopToolbarProps {
  onNewRequest?: () => void;
  onOpenRequest?: () => void;
  onSaveRequest?: () => void;
  onSaveAsRequest?: () => void;
  onMissingMediaRequest?: () => void;
  onExportRequest?: () => void;
}

export default function TopToolbar({
  onNewRequest,
  onOpenRequest,
  onSaveRequest,
  onSaveAsRequest,
  onMissingMediaRequest,
  onExportRequest,
}: TopToolbarProps) {
  const {
    project, flags, ui,
    canUndo, canRedo, undoLabel, redoLabel,
    undo, redo, setUI, newProject,
    saveCurrentProject, openProjectFromDisk,
  } = useProjectStore();

  const handleWorkspace = useCallback((id: WorkspaceId) => {
    setUI({ activeWorkspace: id });
  }, [setUI]);

  const handleNew = useCallback(() => {
    if (onNewRequest) {
      onNewRequest();
    } else {
      newProject();
    }
  }, [onNewRequest, newProject]);

  const handleOpen = useCallback(() => {
    if (onOpenRequest) {
      onOpenRequest();
    } else {
      void openProjectFromDisk();
    }
  }, [onOpenRequest, openProjectFromDisk]);

  const handleSave = useCallback(() => {
    if (onSaveRequest) {
      onSaveRequest();
    } else {
      void saveCurrentProject();
    }
  }, [onSaveRequest, saveCurrentProject]);

  const handleSaveAs = useCallback(() => {
    if (onSaveAsRequest) {
      onSaveAsRequest();
    } else {
      void saveCurrentProject({ saveAs: true });
    }
  }, [onSaveAsRequest, saveCurrentProject]);

  const isTauri = isTauriEnvironment();

  return (
    <header className="flex items-center h-10 px-3 gap-2 bg-forge-bg-secondary border-b border-forge-border-default flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-3 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-forge-gradient flex items-center justify-center flex-shrink-0">
          <Film size={13} className="text-white" />
        </div>
        <span className="font-bold text-sm text-gradient">ReelForge</span>
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-forge-border-subtle mx-1" />

      {/* File Controls */}
      <button
        id="toolbar-new-project"
        className="toolbar-btn"
        onClick={handleNew}
        title="New Project (Ctrl+N)"
      >
        <Plus size={13} />
        <span className="hidden sm:inline">New</span>
      </button>

      <button
        id="toolbar-open-project"
        className="toolbar-btn"
        onClick={handleOpen}
        title="Open Project (Ctrl+O)"
      >
        <FolderOpen size={13} />
        <span className="hidden sm:inline">Open</span>
      </button>

      <button
        id="toolbar-save-project"
        className={cn('toolbar-btn', flags.hasUnsavedChanges && 'text-forge-text-primary')}
        onClick={handleSave}
        title="Save Project (Ctrl+S)"
      >
        <Save size={13} />
        <span className="hidden sm:inline">Save</span>
      </button>

      <button
        id="toolbar-save-as-project"
        className="toolbar-btn"
        onClick={handleSaveAs}
        title="Save As (Ctrl+Shift+S)"
      >
        <FilePlus2 size={13} />
        <span className="hidden sm:inline">Save As</span>
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-forge-border-subtle mx-1" />

      {/* Undo / Redo */}
      <button
        id="toolbar-undo"
        className="toolbar-btn"
        onClick={undo}
        disabled={!canUndo}
        title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo'}
      >
        <Undo2 size={13} />
      </button>
      <button
        id="toolbar-redo"
        className="toolbar-btn"
        onClick={redo}
        disabled={!canRedo}
        title={canRedo ? `Redo: ${redoLabel}` : 'Nothing to redo'}
      >
        <Redo2 size={13} />
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-forge-border-subtle mx-1" />

      {/* Workspace Selector */}
      <nav className="flex items-center gap-0.5">
        {WORKSPACES.map(ws => {
          const Icon = ws.icon;
          const isActive = ui.activeWorkspace === ws.id;
          return (
            <button
              key={ws.id}
              id={`workspace-${ws.id}`}
              onClick={() => handleWorkspace(ws.id)}
              className={cn(
                'toolbar-btn',
                isActive && 'active text-forge-accent-violet',
              )}
              title={ws.label}
            >
              <Icon size={13} />
              <span className="hidden md:inline">{ws.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Missing Media Badge */}
      {flags.missingMediaCount > 0 && (
        <button
          id="toolbar-missing-media-badge"
          onClick={onMissingMediaRequest}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-forge-status-warning/20 border border-forge-status-warning/40 text-forge-status-warning text-xxs font-medium hover:bg-forge-status-warning/30 transition-colors"
          title={`${flags.missingMediaCount} media asset(s) missing. Click to relink.`}
        >
          <AlertTriangle size={11} />
          <span>{flags.missingMediaCount} Missing Media</span>
        </button>
      )}

      {/* Runtime Mode Pill */}
      <div
        className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded bg-forge-bg-elevated text-3xs text-forge-text-muted"
        title={isTauri ? 'Native Tauri Filesystem' : 'Browser Mode: Blob Download & Input'}
      >
        {isTauri ? <HardDrive size={10} /> : <Globe size={10} />}
        <span>{isTauri ? 'Native FS' : 'Browser Mode'}</span>
      </div>

      {/* Project name + status */}
      <div className="flex items-center gap-1.5">
        <span
          id="toolbar-project-name"
          className="text-forge-text-secondary text-xs truncate max-w-40 font-medium"
          title={project.projectFilePath || project.name}
        >
          {project.name}
        </span>
        {flags.hasUnsavedChanges && (
          <span
            id="toolbar-unsaved-dot"
            className="text-forge-status-warning text-xs font-bold"
            title="Unsaved changes"
          >
            ●
          </span>
        )}

        {flags.autosaveStatus === 'saving' && (
          <span className="text-forge-text-muted text-xxs animate-pulse">Saving…</span>
        )}
        {flags.autosaveStatus === 'saved' && (
          <span className="text-forge-status-success text-xxs">✓ Saved</span>
        )}
        {flags.autosaveStatus === 'error' && (
          <span className="text-forge-status-error text-xxs">⚠ Save error</span>
        )}
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-forge-border-subtle mx-1" />

      {/* Panel Toggles */}
      <button
        id="toolbar-toggle-media-bin"
        className={cn('toolbar-btn', ui.mediaBinVisible && 'active')}
        onClick={() => setUI({ mediaBinVisible: !ui.mediaBinVisible })}
        title="Toggle Media Bin"
      >
        <PanelLeft size={13} />
      </button>
      <button
        id="toolbar-toggle-inspector"
        className={cn('toolbar-btn', ui.inspectorVisible && 'active')}
        onClick={() => setUI({ inspectorVisible: !ui.inspectorVisible })}
        title="Toggle Inspector"
      >
        <PanelRight size={13} />
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-forge-border-subtle mx-1" />

      {/* Export */}
      <button
        id="toolbar-export"
        className="btn-primary text-xs py-1 px-3 flex items-center gap-1.5"
        onClick={onExportRequest}
        disabled={flags.isExporting}
        title="Export Video (Ctrl+E)"
      >
        <Download size={12} />
        {flags.isExporting ? 'Exporting…' : 'Export'}
      </button>
    </header>
  );
}
