/**
 * ReelForge Studio — Main Application Shell
 *
 * Layout: Top toolbar → (Media Bin | Preview | Inspector) → Timeline
 * Workspace switcher is in the top toolbar.
 */

import TopToolbar, { type TopToolbarProps } from './TopToolbar';
import MediaBin from '../panels/MediaBin';
import PreviewMonitor from '../panels/PreviewMonitor';
import Inspector from '../panels/Inspector';
import Timeline from '../panels/Timeline';
import { useProjectStore } from '../../state/projectStore';

interface AppShellProps {
  toolbarProps?: TopToolbarProps;
}

export default function AppShell({ toolbarProps }: AppShellProps) {
  const { ui } = useProjectStore();

  const mediaBinWidth = 240;
  const inspectorWidth = 260;

  return (
    <div className="flex flex-col h-screen bg-forge-bg-primary overflow-hidden">
      {/* ─── Top Toolbar ─── */}
      <TopToolbar {...toolbarProps} />

      {/* ─── Main Content Area ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Media Bin */}
        {ui.mediaBinVisible && (
          <div
            className="flex-shrink-0 panel border-r"
            style={{ width: mediaBinWidth }}
          >
            <MediaBin />
          </div>
        )}

        {/* Preview + Inspector */}
        <div className="flex flex-1 overflow-hidden">
          {/* Preview Monitor (center, grows) */}
          <div className="flex-1 flex flex-col overflow-hidden bg-forge-bg-primary">
            <PreviewMonitor />
          </div>

          {/* Inspector Panel */}
          {ui.inspectorVisible && (
            <div
              className="flex-shrink-0 panel border-l"
              style={{ width: inspectorWidth }}
            >
              <Inspector />
            </div>
          )}
        </div>
      </div>

      {/* ─── Timeline ─── */}
      <div
        className="flex-shrink-0 border-t border-forge-border-default bg-forge-bg-secondary"
        style={{ height: 220 }}
      >
        <Timeline />
      </div>
    </div>
  );
}
