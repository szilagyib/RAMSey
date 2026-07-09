import { useDiagramStore } from '../../stores/diagramStore';
import { Input } from '../ui/Input';

function GenericNodeProperties({ nodeId }: { nodeId: string }) {
  const nodes = useDiagramStore((s) => s.nodes);
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;

  const editableKeys = Object.keys(data).filter(
    (key) => typeof data[key] === 'string' || typeof data[key] === 'number' || typeof data[key] === 'boolean',
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
