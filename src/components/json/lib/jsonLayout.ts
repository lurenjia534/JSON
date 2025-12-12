import type { JsonGraph, JsonGraphEdge, JsonGraphNode } from "./jsonGraph";

export type Rect = { x: number; y: number; w: number; h: number };

export type GraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type GraphLayout = {
  rects: Map<string, Rect>;
  nodesById: Map<string, JsonGraphNode>;
  edges: JsonGraphEdge[];
  bounds: GraphBounds;
};

export function layoutJsonGraph(graph: JsonGraph): GraphLayout {
  const rects = new Map<string, Rect>();
  const nodesById = new Map<string, JsonGraphNode>();

  const nodeWidth = 280;
  const headerHeight = 26;
  const rowHeight = 18;
  const paddingY = 10;

  const xGap = 120;
  const yGap = 26;
  const padding = 28;

  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
  }

  const childrenByParent = new Map<string, JsonGraphEdge[]>();
  for (const edge of graph.edges) {
    const bucket = childrenByParent.get(edge.from) ?? [];
    bucket.push(edge);
    childrenByParent.set(edge.from, bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.fromRow - b.fromRow);
  }

  function measureNodeHeight(node: JsonGraphNode): number {
    return paddingY * 2 + headerHeight + node.rows.length * rowHeight;
  }

  let nextY = padding;
  const visited = new Set<string>();

  function dfs(
    nodeId: string,
    depth: number,
  ): { top: number; bottom: number; center: number } {
    const node = nodesById.get(nodeId);
    if (!node) return { top: 0, bottom: 0, center: 0 };
    if (visited.has(nodeId)) return { top: 0, bottom: 0, center: 0 };
    visited.add(nodeId);

    const h = measureNodeHeight(node);
    const children = childrenByParent.get(nodeId) ?? [];

    if (children.length === 0) {
      const y = nextY;
      rects.set(nodeId, {
        x: padding + depth * (nodeWidth + xGap),
        y,
        w: nodeWidth,
        h,
      });
      nextY += h + yGap;
      return { top: y, bottom: y + h, center: y + h / 2 };
    }

    const childInfos: Array<{ top: number; bottom: number; center: number }> =
      [];
    for (const edge of children) {
      childInfos.push(dfs(edge.to, depth + 1));
    }

    const first = childInfos[0];
    const last = childInfos[childInfos.length - 1];
    const center =
      first && last ? (first.center + last.center) / 2 : nextY + h / 2;
    const y = center - h / 2;

    rects.set(nodeId, {
      x: padding + depth * (nodeWidth + xGap),
      y,
      w: nodeWidth,
      h,
    });

    const top = Math.min(y, ...childInfos.map((c) => c.top));
    const bottom = Math.max(y + h, ...childInfos.map((c) => c.bottom));
    return { top, bottom, center: y + h / 2 };
  }

  if (graph.nodes.length > 0) {
    dfs(graph.rootId, 0);
  }

  for (const node of graph.nodes) {
    if (rects.has(node.id)) continue;
    const h = measureNodeHeight(node);
    rects.set(node.id, { x: padding, y: nextY, w: nodeWidth, h });
    nextY += h + yGap;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const rect of rects.values()) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  const bounds: GraphBounds =
    rects.size > 0
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  return { rects, nodesById, edges: graph.edges, bounds };
}
