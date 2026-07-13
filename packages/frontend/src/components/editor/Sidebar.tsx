import { type DragEvent, useMemo } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useDiagramStore } from '../../stores/diagramStore';
import { useEditorPrefs } from '../../stores/editorPrefs';
import { getDiagramTypeConfig, type SidebarItem } from '../../diagram-types/registry';
import { cn } from '../../lib/utils';

const ICON_SIZE = 20;

// ---------------------------------------------------------------------------
// Colors matching the actual node components exactly
// ---------------------------------------------------------------------------

interface NodeColors { fill: string; stroke: string; text?: string }

// Fault Tree: tokens from the diagram notation palette (index.css) so the
// palette previews match the canvas symbols exactly in both themes.
const FT_GATE: NodeColors = {
  fill: 'var(--dg-gate-fill)',
  stroke: 'var(--dg-gate-stroke)',
  text: 'var(--dg-gate-stroke)',
};
const FT_EVENTS: Record<string, NodeColors> = {
  basic_event:        { fill: 'var(--dg-basic-fill)', stroke: 'var(--dg-basic-stroke)' },
  intermediate_event: { fill: 'var(--dg-intermediate-fill)', stroke: 'var(--dg-intermediate-stroke)' },
  top_event:          { fill: 'var(--dg-top-fill)', stroke: 'var(--dg-top-stroke)' },
  undeveloped_event:  { fill: 'var(--dg-undeveloped-fill)', stroke: 'var(--dg-undeveloped-stroke)' },
};
// Markov: StateNode.tsx — light-mode values (high-number = light in dark-first palette)
const MARKOV: Record<string, NodeColors> = {
  operational: { fill: '#e5fbec', stroke: '#2e613c', text: '#0f2418' }, // state-operational-900/400/100
  degraded:    { fill: '#fdf2dc', stroke: '#6b3f13', text: '#2a1a08' }, // state-degraded-900/400/100
  failed:      { fill: '#fce9ea', stroke: '#6a2a2c', text: '#2a0f10' }, // state-failed-900/400/100
  absorbing:   { fill: '#f1f5f9', stroke: '#334155', text: '#0f172a' }, // state-absorbing-900/500/100
};
// Event Tree: node components — light-mode values
const ET: Record<string, NodeColors> = {
  initiating_event: { fill: '#fce9ea', stroke: '#fb923c' }, // bg-red-900, border-orange-400(std)
  header:           { fill: '#bcd2ff', stroke: '#2b4a7a' }, // bg-blue-900, border-blue-400
  consequence:      { fill: '#f8fafc', stroke: '#94a3b8' }, // bg-gray-50(CSS var light), border-gray-400
};
// RBD: node components — light-mode values
const RBD: Record<string, NodeColors> = {
  block:           { fill: '#ffffff', stroke: '#2b4a7a' }, // bg-white, border-blue-400
  input_terminal:  { fill: '#e5fbec', stroke: '#3b7a4a' }, // bg-green-900, border-green-500
  output_terminal: { fill: '#fce9ea', stroke: '#8a3a3e' }, // bg-red-900, border-red-500
};
// Bow-Tie: node components — light-mode values
const BT: Record<string, NodeColors> = {
  threat:             { fill: '#fce9ea', stroke: '#6a2a2c' }, // bg-red-900, border-red-400
  preventive_barrier: { fill: '#bcd2ff', stroke: '#2b4a7a' }, // bg-blue-900, border-blue-400
  top_event:          { fill: '#fffbeb', stroke: '#f59e0b' }, // bg-amber-50(std), border-amber-500(std)
  mitigative_barrier: { fill: '#e5fbec', stroke: '#2e613c' }, // bg-green-900, border-green-400
  consequence:        { fill: '#faf5ff', stroke: '#c084fc' }, // bg-purple-50(std), border-purple-400(std)
};

function SidebarItemIcon({ item, diagramType }: { item: SidebarItem; diagramType: string }) {
  const svgProps = { width: ICON_SIZE, height: ICON_SIZE, viewBox: '0 0 60 60', className: 'h-5 w-5 flex-shrink-0' };

  // ---- Markov Chain ----
  if (diagramType === 'markov_chain') {
    const c = MARKOV[item.type] ?? { fill: '#e2e8f0', stroke: '#94a3b8', text: '#1e293b' };
    const letter = item.label?.[0]?.toUpperCase() ?? '';
    return (
      <svg {...svgProps}>
        <circle cx={30} cy={30} r={22} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
        <text x={30} y={30} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill={c.text ?? c.stroke}>
          {letter}
        </text>
      </svg>
    );
  }

  // ---- Fault Tree: Gates ----
  if (diagramType === 'fault_tree' && item.type.endsWith('_gate')) {
    const c = FT_GATE;
    // Miniatures of the exact IEC 61025 silhouettes drawn on the canvas
    // (no inner text — unreadable at 20px; the item label names the gate).
    if (item.type === 'and_gate') return (
      <svg {...svgProps}>
        <path d="M 8 52 L 8 26 A 22 22 0 0 1 52 26 L 52 52 Z" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    );
    if (item.type === 'or_gate') return (
      <svg {...svgProps}>
        <path d="M 8 52 C 8 30, 16 13, 30 5 C 44 13, 52 30, 52 52 C 38 43, 22 43, 8 52 Z" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    );
    if (item.type === 'not_gate') return (
      <svg {...svgProps}>
        <circle cx={30} cy={9} r={6} fill={c.fill} stroke={c.stroke} strokeWidth={3} />
        <polygon points="30,17 50,52 10,52" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    );
    if (item.type === 'k_of_n_gate') return (
      <svg {...svgProps}>
        <path d="M 8 52 C 8 30, 16 13, 30 5 C 44 13, 52 30, 52 52 C 38 43, 22 43, 8 52 Z" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
        <text x={30} y={33} textAnchor="middle" dominantBaseline="central" fontSize={17} fontWeight={700} fill={c.text}>{'k/n'}</text>
      </svg>
    );
    if (item.type === 'xor_gate') return (
      <svg {...svgProps}>
        <path d="M 8 48 C 8 27, 16 12, 30 4 C 44 12, 52 27, 52 48 C 38 39, 22 39, 8 48 Z" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 8 56 C 22 47, 38 47, 52 56" fill="none" stroke={c.stroke} strokeWidth={3} strokeLinecap="round" />
      </svg>
    );
  }

  // ---- Fault Tree: Events ----
  if (diagramType === 'fault_tree') {
    const c = FT_EVENTS[item.type] ?? { fill: '#f3f4f6', stroke: '#6b7280' };
    if (item.type === 'basic_event') return (
      <svg {...svgProps}>
        <circle cx={30} cy={30} r={26} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'intermediate_event') return (
      <svg {...svgProps}>
        <rect x={4} y={14} width={52} height={32} rx={2} fill={c.fill} stroke={c.stroke} strokeWidth={3} />
      </svg>
    );
    if (item.type === 'top_event') return (
      // Rectangle per IEC 61025 (heavier stroke marks the tree root).
      <svg {...svgProps}>
        <rect x={4} y={14} width={52} height={32} rx={2} fill={c.fill} stroke={c.stroke} strokeWidth={4} />
      </svg>
    );
    if (item.type === 'undeveloped_event') return (
      <svg {...svgProps}>
        <polygon points="30,4 56,30 30,56 4,30" fill={c.fill} stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    );
  }

  // ---- Event Tree ----
  if (diagramType === 'event_tree') {
    const c = ET[item.type] ?? { fill: '#f8fafc', stroke: '#94a3b8' };
    if (item.type === 'initiating_event') return (
      <svg {...svgProps}>
        <rect x={6} y={16} width={48} height={28} rx={6} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'header') return (
      <svg {...svgProps}>
        <rect x={6} y={14} width={48} height={32} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'consequence') return (
      <svg {...svgProps}>
        <rect x={8} y={16} width={44} height={28} rx={6} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
  }

  // ---- Reliability Block Diagram ----
  if (diagramType === 'reliability_block_diagram') {
    const c = RBD[item.type] ?? { fill: '#f8fafc', stroke: '#94a3b8' };
    if (item.type === 'block') return (
      <svg {...svgProps}>
        <rect x={8} y={16} width={44} height={28} rx={5} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'input_terminal' || item.type === 'output_terminal') return (
      <svg {...svgProps}>
        <circle cx={30} cy={30} r={20} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
  }

  // ---- Bow-Tie ----
  if (diagramType === 'bow_tie') {
    const c = BT[item.type] ?? { fill: '#f8fafc', stroke: '#94a3b8' };
    if (item.type === 'threat' || item.type === 'consequence') return (
      <svg {...svgProps}>
        <rect x={6} y={16} width={48} height={28} rx={6} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'preventive_barrier' || item.type === 'mitigative_barrier') return (
      <svg {...svgProps}>
        <rect x={22} y={8} width={16} height={44} fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
    if (item.type === 'top_event') return (
      <svg {...svgProps}>
        <rect x={16} y={16} width={28} height={28} transform="rotate(45 30 30)" fill={c.fill} stroke={c.stroke} strokeWidth={2} />
      </svg>
    );
  }

  // Fallback
  return (
    <svg {...svgProps}>
      <rect x={12} y={12} width={36} height={36} rx={4} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={2} />
    </svg>
  );
}

function DraggableSidebarItem({ item, diagramType }: { item: SidebarItem; diagramType: string }) {
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/ramsey-node-subtype', item.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={cn(
        'flex cursor-grab items-center gap-2.5 rounded-md border px-3 py-2',
        'bg-white dark:bg-surface-100 transition-colors hover:bg-surface-50 dark:hover:bg-surface-200 active:cursor-grabbing',
        item.borderClass ?? 'border-surface-300',
      )}
      draggable
      onDragStart={onDragStart}
    >
      <SidebarItemIcon item={item} diagramType={diagramType} />
      <span className="text-sm font-medium text-surface-700">
        {item.label}
      </span>
    </div>
  );
}

/** Groups sidebar items by their `group` field, preserving insertion order. */
function groupItems(items: SidebarItem[]): { group: string; items: SidebarItem[] }[] {
  const groups: { group: string; items: SidebarItem[] }[] = [];
  const seen = new Map<string, number>();

  for (const item of items) {
    const key = item.group ?? 'Elements';
    const idx = seen.get(key);
    if (idx !== undefined) {
      groups[idx].items.push(item);
    } else {
      seen.set(key, groups.length);
      groups.push({ group: key, items: [item] });
    }
  }

  return groups;
}

export function Sidebar() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const diagramType = useDiagramStore((s) => s.diagramType);
  const palette = useEditorPrefs((s) => s.palette);
  const togglePalette = useEditorPrefs((s) => s.togglePalette);

  const config = getDiagramTypeConfig(diagramType);

  // Memoize on the config object itself — `config?.sidebarItems ?? []` would
  // produce a fresh array each render and defeat the memo.
  const groups = useMemo(() => groupItems(config?.sidebarItems ?? []), [config]);

  // Collapsed: a rail wide enough to click, so the canvas gets the width back.
  if (!palette) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-r border-surface-200 bg-white py-2 dark:bg-surface-100">
        <button
          onClick={togglePalette}
          title="Show palette"
          aria-label="Show palette"
          className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-200"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-52 shrink-0 min-h-0 flex-col border-r border-surface-200 bg-white dark:bg-surface-100">
      <div className="flex justify-end border-b border-surface-200 px-2 py-1">
        <button
          onClick={togglePalette}
          title="Collapse palette"
          aria-label="Collapse palette"
          className="rounded p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-200"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {groups.map(({ group, items }) => (
          <div key={group} className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
              {group}
            </h3>
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <DraggableSidebarItem key={item.type} item={item} diagramType={diagramType} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-surface-200 px-3 py-2">
        <p className="text-xs text-surface-400">
          {nodes.length} node{nodes.length !== 1 ? 's' : ''},{' '}
          {edges.length} edge{edges.length !== 1 ? 's' : ''}
        </p>
      </div>
    </aside>
  );
}
