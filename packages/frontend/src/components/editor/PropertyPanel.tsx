import { useDiagramStore } from '../../stores/diagramStore';
import { Input } from '../ui/Input';
import { getNodeColor, NODE_COLOR_PRESETS } from '../../lib/nodeColor';
import { cn } from '../../lib/utils';

function NodeColorRow({ nodeId, data }: { nodeId: string; data: Record<string, unknown> }) {
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  const current = getNodeColor(data);

  // Swatch/reset clicks are discrete decisions — each gets its own undo entry
  // (runInHistoryEntry breaks the keystroke-coalescing window). The native
  // picker stays coalesced: dragging it fires a continuous onChange stream.
  const setDiscrete = (color: string | null) => {
    useDiagramStore.getState().runInHistoryEntry(() => updateNodeData(nodeId, { color }));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-surface-700">color</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {NODE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            title={preset}
            aria-label={`Set color ${preset}`}
            onClick={() => setDiscrete(preset)}
            className={cn(
              'h-5 w-5 rounded-full border transition-transform hover:scale-110',
              current === preset ? 'border-2 border-surface-700' : 'border-surface-300',
            )}
            style={{ background: preset }}
          />
        ))}
        <input
          type="color"
          aria-label="Node color"
          value={current ?? '#64748b'}
          onChange={(e) => updateNodeData(nodeId, { color: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-surface-300 bg-transparent p-0"
        />
        {current && (
          <button
            onClick={() => setDiscrete(null)}
            className="text-xs text-surface-400 hover:text-surface-600 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function GenericNodeProperties({ nodeId }: { nodeId: string }) {
  const nodes = useDiagramStore((s) => s.nodes);
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;

  // 'color' gets its dedicated picker row below, not a raw text input.
  const editableKeys = Object.keys(data).filter(
    (key) =>
      key !== 'color' &&
      (typeof data[key] === 'string' || typeof data[key] === 'number' || typeof data[key] === 'boolean'),
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
        Node Properties
      </h3>

      {editableKeys.map((key) => {
        const value = data[key];
        if (typeof value === 'boolean') {
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-surface-700">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => updateNodeData(nodeId, { [key]: e.target.checked })}
                className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              {key}
            </label>
          );
        }

        return (
          <Input
            key={key}
            label={key}
            value={String(value ?? '')}
            onChange={(e) => {
              const newValue = typeof value === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
              updateNodeData(nodeId, { [key]: newValue });
            }}
            type={typeof value === 'number' ? 'number' : 'text'}
          />
        );
      })}

      <NodeColorRow nodeId={nodeId} data={data} />

      <p className="text-xs text-surface-400">ID: {nodeId}</p>
    </div>
  );
}

function GenericEdgeProperties({ edgeId }: { edgeId: string }) {
  const edges = useDiagramStore((s) => s.edges);
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);

  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const data = (edge.data ?? {}) as Record<string, unknown>;

  const editableKeys = Object.keys(data).filter(
    (key) => typeof data[key] === 'string' || typeof data[key] === 'number',
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
        Edge Properties
      </h3>

      {editableKeys.map((key) => {
        const value = data[key];
        return (
          <Input
            key={key}
            label={key}
            value={String(value ?? '')}
            onChange={(e) => {
              const newValue = typeof value === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
              updateEdgeData(edgeId, { [key]: newValue });
            }}
            type={typeof value === 'number' ? 'number' : 'text'}
          />
        );
      })}

      <p className="text-xs text-surface-400">
        {edge.source} → {edge.target}
      </p>
    </div>
  );
}

export function PropertyPanel() {
  const selectedNodeId = useDiagramStore((s) => s.selectedNodeId);
  const selectedEdgeId = useDiagramStore((s) => s.selectedEdgeId);

  const hasSelection = selectedNodeId || selectedEdgeId;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNodeId && <GenericNodeProperties nodeId={selectedNodeId} />}
        {selectedEdgeId && <GenericEdgeProperties edgeId={selectedEdgeId} />}
        {!hasSelection && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-surface-400">
              Select a node or edge
              <br />
              to edit its properties
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
