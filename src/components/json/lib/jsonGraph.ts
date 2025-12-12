import { isPlainObject } from "./jsonUtils";

export type JsonValueType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export type JsonGraphRow = {
  key: string;
  value: string;
  childId?: string;
};

export type JsonGraphNode = {
  id: string;
  label: string;
  path: string;
  type: JsonValueType;
  summary: string;
  rows: JsonGraphRow[];
  depth: number;
};

export type JsonGraphEdge = { from: string; to: string; fromRow: number };

export type JsonGraph = {
  rootId: string;
  nodes: JsonGraphNode[];
  edges: JsonGraphEdge[];
  truncated: boolean;
};

function jsonValueType(value: unknown): JsonValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function jsonPreview(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const compact = value.length > 48 ? `${value.slice(0, 48)}…` : value;
    return JSON.stringify(compact);
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `Array(${value.length.toLocaleString()})`;
  if (isPlainObject(value))
    return `Object(${Object.keys(value).length.toLocaleString()})`;
  return Object.prototype.toString.call(value);
}

function isIdentifierKey(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function jsonPathAppend(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  if (isIdentifierKey(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
}

function isContainer(
  value: unknown,
): value is unknown[] | Record<string, unknown> {
  return Array.isArray(value) || isPlainObject(value);
}

export function buildJsonGraph(
  root: unknown,
  options: { maxDepth: number; maxNodes: number; maxChildrenPerNode: number },
): JsonGraph {
  const nodes: JsonGraphNode[] = [];
  const nodesById = new Map<string, JsonGraphNode>();
  const edges: JsonGraphEdge[] = [];
  let truncated = false;

  const { maxDepth, maxNodes, maxChildrenPerNode } = options;
  let nextId = 0;

  function pushNode(
    label: string,
    path: string,
    value: unknown,
    depth: number,
  ): string {
    const id = `n${nextId++}`;
    const node: JsonGraphNode = {
      id,
      label,
      path,
      depth,
      type: jsonValueType(value),
      summary: jsonPreview(value),
      rows: [],
    };
    nodes.push(node);
    nodesById.set(id, node);
    return id;
  }

  const rootId = pushNode("$", "$", root, 0);
  const queue: Array<{
    id: string;
    value: unknown;
    path: string;
    depth: number;
  }> = [{ id: rootId, value: root, path: "$", depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const { id: parentId, value, path, depth } = current;
    const node = nodesById.get(parentId);
    if (!node) continue;

    if (!isContainer(value)) continue;

    const rows: JsonGraphRow[] = [];

    if (Array.isArray(value)) {
      const visible = Math.min(value.length, maxChildrenPerNode);
      if (value.length > visible) truncated = true;

      for (let i = 0; i < visible; i++) {
        const childValue = value[i];
        const rowIndex = rows.length;
        let childId: string | undefined;

        if (
          isContainer(childValue) &&
          depth < maxDepth &&
          nodes.length < maxNodes
        ) {
          const childPath = jsonPathAppend(path, i);
          childId = pushNode(`[${i}]`, childPath, childValue, depth + 1);
          edges.push({ from: parentId, to: childId, fromRow: rowIndex });
          queue.push({
            id: childId,
            value: childValue,
            path: childPath,
            depth: depth + 1,
          });
        } else if (
          isContainer(childValue) &&
          (depth >= maxDepth || nodes.length >= maxNodes)
        ) {
          truncated = true;
        }

        rows.push({ key: String(i), value: jsonPreview(childValue), childId });
      }

      if (value.length > visible) {
        rows.push({
          key: "…",
          value: `+${(value.length - visible).toLocaleString()} 更多`,
        });
      }

      node.rows = rows;
      continue;
    }

    if (isPlainObject(value)) {
      let shown = 0;
      let hasMore = false;

      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (shown >= maxChildrenPerNode) {
          hasMore = true;
          truncated = true;
          break;
        }

        const childValue = value[key];
        const rowIndex = rows.length;
        let childId: string | undefined;

        if (
          isContainer(childValue) &&
          depth < maxDepth &&
          nodes.length < maxNodes
        ) {
          const childPath = jsonPathAppend(path, key);
          childId = pushNode(key, childPath, childValue, depth + 1);
          edges.push({ from: parentId, to: childId, fromRow: rowIndex });
          queue.push({
            id: childId,
            value: childValue,
            path: childPath,
            depth: depth + 1,
          });
        } else if (
          isContainer(childValue) &&
          (depth >= maxDepth || nodes.length >= maxNodes)
        ) {
          truncated = true;
        }

        rows.push({ key, value: jsonPreview(childValue), childId });
        shown++;
      }

      if (hasMore) {
        rows.push({ key: "…", value: "更多字段…" });
      }

      node.rows = rows;
    }
  }

  return { rootId, nodes, edges, truncated };
}
