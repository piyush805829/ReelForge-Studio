/**
 * ReelForge Studio — Inspector Panel
 *
 * Context-sensitive panel that shows layer properties when a layer is selected,
 * or project properties when nothing is selected.
 */

import { useProjectStore, selectActiveComposition } from '../../state/projectStore';
import type { Layer } from '../../project/schema/types';

export default function Inspector() {
  const selectedLayerIds = useProjectStore(state => state.ui.selectedLayerIds);
  const comp = useProjectStore(selectActiveComposition);
  const selectedIds = Array.from(selectedLayerIds);

  const selectedLayer = selectedIds.length === 1 && comp
    ? comp.layers[selectedIds[0]]
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header">
        {selectedLayer ? 'Layer Properties' : 'Inspector'}
      </div>

      <div className="flex-1 forge-scroll p-3">
        {selectedLayer ? (
          <LayerInspector layer={selectedLayer} />
        ) : (
          <ProjectInspector />
        )}
      </div>
    </div>
  );
}

// ─── Layer Inspector ──────────────────────────────────────────────────────────

function LayerInspector({ layer }: { layer: Layer }) {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Layer name */}
      <Section label="Layer">
        <Row label="Name">
          <span className="text-forge-text-primary text-xs truncate">{layer.name}</span>
        </Row>
        <Row label="Type">
          <Badge>{layer.layerType}</Badge>
        </Row>
        <Row label="Enabled">
          <Badge color={layer.enabled ? 'green' : 'gray'}>
            {layer.enabled ? 'Yes' : 'No'}
          </Badge>
        </Row>
      </Section>

      {/* Transform */}
      <Section label="Transform">
        <Row label="Position">
          <span className="font-mono text-xxs text-forge-text-primary">
            {layer.transform.positionX.toFixed(1)}, {layer.transform.positionY.toFixed(1)}
          </span>
        </Row>
        <Row label="Scale">
          <span className="font-mono text-xxs text-forge-text-primary">
            {(layer.transform.scaleX * 100).toFixed(0)}%, {(layer.transform.scaleY * 100).toFixed(0)}%
          </span>
        </Row>
        <Row label="Rotation">
          <span className="font-mono text-xxs text-forge-text-primary">
            {layer.transform.rotation.toFixed(1)}°
          </span>
        </Row>
        <Row label="Opacity">
          <span className="font-mono text-xxs text-forge-text-primary">
            {(layer.transform.opacity * 100).toFixed(0)}%
          </span>
        </Row>
      </Section>

      {/* Timing */}
      <Section label="Timing">
        <Row label="Start">
          <span className="font-mono text-xxs text-forge-text-primary">
            {(layer.timelineStartTicks / 240000).toFixed(3)}s
          </span>
        </Row>
        <Row label="Duration">
          <span className="font-mono text-xxs text-forge-text-primary">
            {(layer.timelineDurationTicks / 240000).toFixed(3)}s
          </span>
        </Row>
        <Row label="Speed">
          <span className="font-mono text-xxs text-forge-text-primary">
            {layer.speed}×
          </span>
        </Row>
      </Section>

      {/* Audio */}
      {layer.audioSettings && (
        <Section label="Audio">
          <Row label="Volume">
            <span className="font-mono text-xxs text-forge-text-primary">
              {(layer.audioSettings.volume * 100).toFixed(0)}%
            </span>
          </Row>
          <Row label="Mute">
            <Badge color={layer.audioSettings.mute ? 'red' : 'gray'}>
              {layer.audioSettings.mute ? 'Muted' : 'On'}
            </Badge>
          </Row>
        </Section>
      )}

      {/* Effects */}
      {layer.effects.length > 0 && (
        <Section label={`Effects (${layer.effects.length})`}>
          {layer.effects.map(fx => (
            <Row key={fx.id} label={fx.effectType}>
              <Badge color={fx.enabled ? 'blue' : 'gray'}>
                {fx.enabled ? 'On' : 'Off'}
              </Badge>
            </Row>
          ))}
        </Section>
      )}

      <div className="text-xxs text-forge-text-muted mt-2 border-t border-forge-border-subtle pt-2">
        Full property editing coming in Milestone 2.
      </div>
    </div>
  );
}

// ─── Project Inspector (nothing selected) ────────────────────────────────────

function ProjectInspector() {
  const { project } = useProjectStore();
  const comp = useProjectStore(selectActiveComposition);

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <Section label="Project">
        <Row label="Name">
          <span className="text-forge-text-primary text-xs truncate">{project.name}</span>
        </Row>
        <Row label="Assets">
          <span className="font-mono text-xxs text-forge-text-primary">
            {Object.keys(project.assetRegistry).length}
          </span>
        </Row>
        <Row label="Compositions">
          <span className="font-mono text-xxs text-forge-text-primary">
            {Object.keys(project.compositionRegistry).length}
          </span>
        </Row>
        <Row label="Schema">
          <Badge>v{project.schemaVersion}</Badge>
        </Row>
      </Section>

      {comp && (
        <Section label="Main Composition">
          <Row label="Canvas">
            <span className="font-mono text-xxs text-forge-text-primary">
              {comp.width}×{comp.height}
            </span>
          </Row>
          <Row label="Frame Rate">
            <span className="font-mono text-xxs text-forge-text-primary">
              {(comp.frameRate.numerator / comp.frameRate.denominator).toFixed(3)} fps
            </span>
          </Row>
          <Row label="Duration">
            <span className="font-mono text-xxs text-forge-text-primary">
              {(comp.durationTicks / 240000).toFixed(2)}s
            </span>
          </Row>
          <Row label="Layers">
            <span className="font-mono text-xxs text-forge-text-primary">
              {comp.orderedLayerIds.length}
            </span>
          </Row>
        </Section>
      )}

      <div className="text-xxs text-forge-text-muted mt-2 pt-2 border-t border-forge-border-subtle">
        Select a layer on the timeline to inspect its properties.
      </div>
    </div>
  );
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xxs font-semibold text-forge-text-muted uppercase tracking-wider mb-2">
        {label}
      </h3>
      <div className="flex flex-col gap-1.5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xxs text-forge-text-muted flex-shrink-0 w-20">{label}</span>
      <div className="flex-1 overflow-hidden text-right">{children}</div>
    </div>
  );
}

function Badge({
  children,
  color = 'violet',
}: {
  children: React.ReactNode;
  color?: 'violet' | 'green' | 'red' | 'blue' | 'gray';
}) {
  const colors = {
    violet: 'bg-forge-accent-violet/20 text-forge-accent-violet',
    green:  'bg-forge-status-success/20 text-forge-status-success',
    red:    'bg-forge-status-error/20 text-forge-status-error',
    blue:   'bg-forge-accent-blue/20 text-forge-accent-blue',
    gray:   'bg-forge-bg-elevated text-forge-text-muted',
  };
  return (
    <span className={`text-xxs px-1.5 py-0.5 rounded font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
