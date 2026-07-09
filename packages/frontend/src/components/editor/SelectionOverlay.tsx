import { ViewportPortal, type Node } from '@xyflow/react';

export interface RemoteSelection {
  nodeId: string;
  color?: string;
  name?: string;
}

const DEFAULT_W = 120;
const DEFAULT_H = 60;

/**
 * Outlines nodes that remote collaborators have selected, in their cursor
 * color. Rendered in flow coordinates via ViewportPortal so it tracks pan/zoom.
 */
export function SelectionOverlay({ selections, nodes }: { selections: RemoteSelection[]; nodes: Node[] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <ViewportPortal>
      {selections.map((sel, i) => {
        const node = byId.get(sel.nodeId);
        if (!node) return null;
        const width = node.measured?.width ?? DEFAULT_W;
        const height = node.measured?.height ?? DEFAULT_H;
        const color = sel.color ?? '#64748b';
        return (
          <div
            key={`${sel.nodeId}-${i}`}
            style={{
              position: 'absolute',
              transform: `translate(${node.position.x}px, ${node.position.y}px)`,
              width,
              height,
              border: `2px solid ${color}`,
              borderRadius: 6,
              pointerEvents: 'none',
              zIndex: 999,
            }}
          >
            <span
              className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[9px] font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {sel.name ?? 'Anonymous'}
            </span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
