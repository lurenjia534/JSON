"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { JsonGraphNode } from "../lib/jsonGraph";

export type JsonFlowNodeData = {
  node: JsonGraphNode;
};

export function JsonFlowNode(props: NodeProps) {
  const node = (props.data as JsonFlowNodeData).node;
  const rows = node.rows.slice(0, 18);
  const hasMore = node.rows.length > rows.length;

  return (
    <div
      className={`w-70 rounded-xl border bg-white/95 shadow-sm backdrop-blur dark:bg-zinc-950/90 ${
        props.selected
          ? "border-sky-500 ring-2 ring-sky-200 dark:ring-sky-500/30"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-2.5! w-2.5! border-2! border-zinc-300! bg-white! dark:border-zinc-700! dark:bg-zinc-950!"
      />

      <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-3 py-2 dark:border-zinc-800/70">
        <div className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          {node.label}
        </div>
        <div className="shrink-0 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {node.summary}
        </div>
      </div>

      <div className="px-3 py-2 font-mono text-[11px] leading-5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-17.5 shrink-0 truncate text-red-600/90 dark:text-red-300/90">
              {row.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-sky-700 dark:text-sky-300">
              {row.value}
            </span>
          </div>
        ))}
        {hasMore ? (
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">…</div>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="h-2.5! w-2.5! border-2! border-zinc-300! bg-white! dark:border-zinc-700! dark:bg-zinc-950!"
      />
    </div>
  );
}
