import type { TreeLayoutResult } from "./treeLayout";

const CARD_VISUAL_HEIGHT = 118;
const TOP_OFFSET = 6;

export function TreeEdges({
  layout,
  highlightedIds,
}: {
  layout: TreeLayoutResult;
  highlightedIds?: Set<string>;
}) {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={layout.width}
      height={layout.height}
      style={{ overflow: "visible" }}
    >
      {layout.edges.map((edge) => {
        const y1 = edge.y1 + CARD_VISUAL_HEIGHT;
        const y2 = edge.y2 + TOP_OFFSET;
        const midY = (y1 + y2) / 2;
        const isHighlighted =
          highlightedIds && highlightedIds.has(edge.parentId) && highlightedIds.has(edge.childId);
        return (
          <path
            key={edge.id}
            d={`M ${edge.x1} ${y1} L ${edge.x1} ${midY} L ${edge.x2} ${midY} L ${edge.x2} ${y2}`}
            fill="none"
            stroke={isHighlighted ? "hsl(var(--primary))" : "hsl(var(--border))"}
            strokeWidth={isHighlighted ? 2.5 : 1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
