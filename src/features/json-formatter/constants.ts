import type { GraphOptions, GraphPreset, OutputKind } from "./types";

export const GRAPH_PRESETS: Record<GraphPreset, GraphOptions> = {
  default: { maxDepth: 6, maxNodes: 240, maxChildrenPerNode: 30 },
  more: { maxDepth: 12, maxNodes: 3000, maxChildrenPerNode: 200 },
  all: {
    maxDepth: Number.POSITIVE_INFINITY,
    maxNodes: Number.POSITIVE_INFINITY,
    maxChildrenPerNode: Number.POSITIVE_INFINITY,
  },
};

export const OUTPUT_KIND_LABELS: Record<NonNullable<OutputKind>, string> = {
  formatted: "已格式化",
  minified: "已压缩",
  escaped: "已转义",
  unescaped: "已反转义",
};
