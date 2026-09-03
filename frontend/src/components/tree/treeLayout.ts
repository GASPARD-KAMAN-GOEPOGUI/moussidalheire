import { hierarchy, tree as d3tree } from "d3-hierarchy";
import type { FamilyTreeNode } from "@/services/api/tree";

export const NODE_DX = 270;
export const NODE_DY = 220;
export const CARD_WIDTH = 108;
export const CARD_HEIGHT = 138;
export const PADDING = 100;

export interface LaidOutNode {
  id: string;
  data: FamilyTreeNode;
  x: number;
  y: number;
  depth: number;
  parentId?: string;
  hasChildren: boolean;
  collapsed: boolean;
}

export interface TreeLayoutResult {
  nodes: LaidOutNode[];
  edges: { id: string; parentId: string; childId: string; x1: number; y1: number; x2: number; y2: number }[];
  width: number;
  height: number;
}

/** A node with N spouses renders as N+1 side-by-side `MiniCard`s (see
 * `TreeNode.tsx`) — widening its slot here (instead of a fixed `NODE_DX`)
 * keeps those extra cards from overlapping the neighboring sibling's slot. */
function widestNodeWidth(node: FamilyTreeNode): number {
  const own = CARD_WIDTH + node.spouses.length * (CARD_WIDTH + 24);
  return node.children.reduce((max, c) => Math.max(max, widestNodeWidth(c)), own);
}

export function computeTreeLayout(
  root: FamilyTreeNode,
  collapsedIds: Set<string>,
): TreeLayoutResult {
  const hierarchyRoot = hierarchy<FamilyTreeNode>(root, (d) =>
    collapsedIds.has(d.person.id) ? undefined : d.children,
  );

  const nodeDx = Math.max(NODE_DX, widestNodeWidth(root) + 40);
  const layout = d3tree<FamilyTreeNode>()
    .nodeSize([nodeDx, NODE_DY])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25));

  layout(hierarchyRoot);

  const d3nodes = hierarchyRoot.descendants();
  const xs = d3nodes.map((n) => n.x ?? 0);
  const minX = Math.min(...xs);

  const offsetX = -minX + PADDING;
  const offsetY = PADDING;

  const nodes: LaidOutNode[] = d3nodes.map((n) => ({
    id: n.data.person.id,
    data: n.data,
    x: (n.x ?? 0) + offsetX,
    y: (n.y ?? 0) + offsetY,
    depth: n.depth,
    parentId: n.parent?.data.person.id,
    hasChildren: n.data.children.length > 0,
    collapsed: collapsedIds.has(n.data.person.id) && n.data.children.length > 0,
  }));

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const edges = nodes
    .filter((n) => n.parentId)
    .map((n) => {
      const parent = byId.get(n.parentId!)!;
      return {
        id: `${parent.id}-${n.id}`,
        parentId: parent.id,
        childId: n.id,
        x1: parent.x,
        y1: parent.y,
        x2: n.x,
        y2: n.y,
      };
    });

  const maxX = Math.max(...nodes.map((n) => n.x));
  const maxY = Math.max(...nodes.map((n) => n.y));

  return {
    nodes,
    edges,
    width: maxX + CARD_WIDTH + PADDING,
    height: maxY + CARD_HEIGHT + PADDING,
  };
}
