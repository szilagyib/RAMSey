import { useDiagramStore } from '../../stores/diagramStore';
import { NUMERIC_FIELDS, validateNumericField } from '../../lib/fieldDomains';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  getNodeColor,
  getNodeFill,
  getNodeText,
  getEdgeColor,
  getNodeOpacity,
  NODE_COLOR_PRESETS,
} from '../../lib/nodeColor';
import {
  ENUM_OPTIONS,
  HIDDEN_FIELDS,
  READONLY_FIELDS,
  fieldLabel,
  optionLabel,
} from '../../lib/fieldSchema';
import { cn } from '../../lib/utils';

/**
 * One color channel: preset swatches + native picker + reset. `label` names
 * the channel; `current` is the '#rrggbb' in effect or null; `onSet` commits a
 * value (discrete — its own undo entry) and `onPick` a live picker value.
 */
function ColorControl({
  label,
  current,
  onSet,
  onPick,
}: {
  label: string;
  current: string | null;
  onSet: (color: string | null) => void;
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-surface-700">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {NODE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            title={preset}
            aria-label={`Set ${label} ${preset}`}
            onClick={() => onSet(preset)}
            className={cn(
              'h-5 w-5 rounded-full border transition-transform hover:scale-110',
              current === preset ? 'border-2 border-surface-700' : 'border-surface-300',
            )}
            style={{ background: preset }}
          />
        ))}
        <input
          type="color"
          aria-label={`${label} picker`}
          value={current ?? '#64748b'}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-surface-300 bg-transparent p-0"
        />
        {current && (
          <button
            onClick={() => onSet(null)}
            className="text-xs text-surface-400 hover:text-surface-600 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function NodeColorControls({ nodeId, data }: { nodeId: string; data: Record<string, unknown> }) {
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);
  // Discrete swatch/reset clicks each get their own undo entry
  // (runInHistoryEntry breaks the keystroke-coalescing window); the native
  // picker stays coalesced (its drag fires a continuous onChange stream).
  const setDiscrete = (patch: Record<string, unknown>) =>
    useDiagramStore.getState().runInHistoryEntry(() => updateNodeData(nodeId, patch));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-surface-200 dark:border-surface-300 p-3">
      <ColorControl
        label="Fill"
        current={getNodeFill(data)}
        onSet={(c) => setDiscrete({ fillColor: c })}
        onPick={(c) => updateNodeData(nodeId, { fillColor: c })}
      />
      <ColorControl
        label="Border"
        current={getNodeColor(data)}
        onSet={(c) => setDiscrete({ color: c })}
        onPick={(c) => updateNodeData(nodeId, { color: c })}
      />
      <ColorControl
        label="Text"
        current={getNodeText(data)}
        onSet={(c) => setDiscrete({ textColor: c })}
        onPick={(c) => updateNodeData(nodeId, { textColor: c })}
      />

      <OpacityControl
        value={getNodeOpacity(data) ?? 1}
        // Dragging fires a continuous stream, so it stays coalesced into one
        // undo entry; letting go, and Reset, are discrete.
        onDrag={(v) => updateNodeData(nodeId, { opacity: v })}
        onCommit={(v) => setDiscrete({ opacity: v })}
        onReset={() => setDiscrete({ opacity: 1 })}
      />
    </div>
  );
}

/** Fade a node back without deleting it — for out-of-scope or as-yet-unmodelled parts. */
function OpacityControl({
  value,
  onDrag,
  onCommit,
  onReset,
}: {
  value: number;
  onDrag: (v: number) => void;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-surface-600">Opacity</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-surface-400">{percent}%</span>
          {value < 1 && (
            <button
              onClick={onReset}
              className="text-[11px] text-surface-400 hover:text-surface-700"
              title="Reset opacity"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={percent}
        aria-label="Opacity"
        // 10% floor: a node at 0 is invisible and unclickable, which reads as a
        // bug rather than a choice. Delete it if you want it gone.
        onChange={(e) => onDrag(Number(e.target.value) / 100)}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value) / 100)}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-200 accent-primary-600"
      />
    </div>
  );
}

function GenericNodeProperties({ nodeId }: { nodeId: string }) {
  const nodes = useDiagramStore((s) => s.nodes);
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;

  // Color channels get dedicated pickers below, not raw text inputs.
  const editableKeys = Object.keys(data).filter(
    (key) =>
      !HIDDEN_FIELDS.has(key) &&
      (typeof data[key] === 'string' ||
        typeof data[key] === 'number' ||
        typeof data[key] === 'boolean'),
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
        Node Properties
      </h3>

      {editableKeys.map((key) => {
        const value = data[key];

        // What kind of node this is picks the component that draws it, so it
        // can't be re-typed here — but seeing it tells you what you selected.
        if (READONLY_FIELDS.has(key)) {
          return (
            <ReadOnlyField
              key={key}
              label={fieldLabel(key)}
              value={optionLabel(String(value ?? ''))}
            />
          );
        }

        const options = ENUM_OPTIONS[key];
        if (options) {
          return (
            <Select
              key={key}
              label={fieldLabel(key)}
              value={String(value ?? '')}
              options={options.map((o) => ({ value: o, label: optionLabel(o) }))}
              onChange={(e) =>
                useDiagramStore
                  .getState()
                  .runInHistoryEntry(() => updateNodeData(nodeId, { [key]: e.target.value }))
              }
            />
          );
        }

        if (typeof value === 'boolean') {
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-surface-700">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  useDiagramStore
                    .getState()
                    .runInHistoryEntry(() => updateNodeData(nodeId, { [key]: e.target.checked }))
                }
                className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              {fieldLabel(key)}
            </label>
          );
        }

        // Reliability fields (probability, rates…) are stored as strings, so the
        // type alone would render them as free text — NUMERIC_FIELDS says which
        // are numeric and what range explains a bad value.
        const domain = NUMERIC_FIELDS[key];
        return (
          <Input
            key={key}
            label={fieldLabel(key)}
            value={String(value ?? '')}
            onChange={(e) => {
              const newValue =
                typeof value === 'number'
                  ? e.target.value === ''
                    ? ''
                    : Number(e.target.value)
                  : e.target.value;
              updateNodeData(nodeId, { [key]: newValue });
            }}
            type={domain || typeof value === 'number' ? 'number' : 'text'}
            min={domain?.min}
            max={domain?.max}
            step="any"
            error={validateNumericField(key, value) ?? undefined}
          />
        );
      })}

      <NodeColorControls nodeId={nodeId} data={data} />

      <p className="text-xs text-surface-400">ID: {nodeId}</p>
    </div>
  );
}

/** A field the user can read but not change (see READONLY_FIELDS). */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-surface-700">{label}</span>
      <p className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-500 dark:bg-surface-200">
        {value}
      </p>
    </div>
  );
}

function GenericEdgeProperties({ edgeId }: { edgeId: string }) {
  const edges = useDiagramStore((s) => s.edges);
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData);

  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const data = (edge.data ?? {}) as Record<string, unknown>;

  const setDiscrete = (patch: Record<string, unknown>) =>
    useDiagramStore.getState().runInHistoryEntry(() => updateEdgeData(edgeId, patch));

  // 'color' gets a picker; cpX/cpY are the control-point coords (not editable
  // as text).
  const editableKeys = Object.keys(data).filter(
    (key) =>
      !HIDDEN_FIELDS.has(key) && (typeof data[key] === 'string' || typeof data[key] === 'number'),
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
        Edge Properties
      </h3>

      {editableKeys.map((key) => {
        const value = data[key];

        const options = ENUM_OPTIONS[key];
        if (options) {
          return (
            <Select
              key={key}
              label={fieldLabel(key)}
              value={String(value ?? '')}
              options={options.map((o) => ({ value: o, label: optionLabel(o) }))}
              onChange={(e) => setDiscrete({ [key]: e.target.value })}
            />
          );
        }

        const domain = NUMERIC_FIELDS[key];
        return (
          <Input
            key={key}
            label={fieldLabel(key)}
            value={String(value ?? '')}
            onChange={(e) => {
              const newValue =
                typeof value === 'number'
                  ? e.target.value === ''
                    ? ''
                    : Number(e.target.value)
                  : e.target.value;
              updateEdgeData(edgeId, { [key]: newValue });
            }}
            type={domain || typeof value === 'number' ? 'number' : 'text'}
            min={domain?.min}
            max={domain?.max}
            step="any"
            error={validateNumericField(key, value) ?? undefined}
          />
        );
      })}

      <div className="rounded-md border border-surface-200 dark:border-surface-300 p-3">
        <ColorControl
          label="Color"
          current={getEdgeColor(data)}
          onSet={(c) => setDiscrete({ color: c })}
          onPick={(c) => updateEdgeData(edgeId, { color: c })}
        />
      </div>

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
