/**
 * The one arrowhead used by every directed edge (Markov transitions,
 * event-tree branches, bow-tie pathways).
 *
 * We define it ourselves rather than going through React Flow's `markerEnd`
 * edge property, because that property only lands on edges created by dragging
 * a connection — an edge loaded from the database, imported from JSON, pasted,
 * or produced by auto-layout has no `markerEnd` and would render with no
 * arrowhead at all. Referencing a fixed marker from the edge component instead
 * makes the arrow a property of the edge *type*, so it cannot go missing.
 *
 * `fill="context-stroke"` makes the head inherit the stroke of the path that
 * references it, so it always matches the curve — selected blue, the ETA
 * success/failure colours, or a user-picked colour — with no per-colour marker
 * defs. `orient="auto"` rotates it to the path's tangent at the endpoint, so it
 * follows curved and user-shaped edges.
 */
export const ARROW_MARKER_ID = 'ramsey-arrow';
export const ARROW_MARKER = `url(#${ARROW_MARKER_ID})`;

export function EdgeMarkers() {
  return (
    <svg className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="9.5"
          refY="5"
          markerWidth="12"
          markerHeight="12"
          // In user units, so the head keeps its size when an edge thickens on
          // selection (strokeWidth units would make it jump).
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  );
}
