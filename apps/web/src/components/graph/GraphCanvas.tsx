"use client";

import {
  Background,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./GraphCanvas.css";
import { GraphLegend } from "./GraphLegend";
import { GraphToolbar } from "./GraphToolbar";
import { karyaNodeTypes } from "./KaryaNode";
import type { KaryaNodeData } from "./types";
import { layoutGraph } from "@/lib/graph-layout";
import type { GraphSnapshot } from "@/lib/graph-data";
import type { ApiException } from "@/lib/api";

type GraphCanvasProps = {
  snapshot: GraphSnapshot;
  exceptions: ApiException[];
  onNodeSelect: (key: string | null) => void;
  selectedNodeKey: string | null;
};

function edgeClassName(
  edge: { fromId: string; toId: string },
  hoveredId: string | null,
): string {
  if (!hoveredId) return "";
  if (edge.fromId === hoveredId || edge.toId === hoveredId) return "highlighted";
  return "faded";
}

function toFlowNodes(
  snapshot: GraphSnapshot,
  positions: Map<string, { x: number; y: number }>,
  selectedNodeKey: string | null,
  highlightedIds: Set<string>,
  exceptionByNodeId: Map<string, "risk" | "warn">,
): Node<KaryaNodeData>[] {
  return snapshot.nodes.map((n) => ({
    id: n._id,
    type: "karya",
    position: positions.get(n._id) ?? { x: 0, y: 0 },
    data: {
      nodeKey: n.key,
      label: n.label,
      nodeType: n.type,
      selected: n.key === selectedNodeKey,
      highlighted: highlightedIds.has(n._id),
      exceptionSeverity: exceptionByNodeId.get(n._id) ?? null,
    },
  }));
}

function toFlowEdges(
  snapshot: GraphSnapshot,
  hoveredId: string | null,
): Edge[] {
  return snapshot.edges.map((e) => ({
    id: e._id,
    source: e.fromId,
    target: e.toId,
    label: e.type,
    className: edgeClassName(e, hoveredId),
  }));
}

function GraphNodeSearch({
  snapshot,
  onPick,
}: {
  snapshot: GraphSnapshot;
  onPick: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodes = snapshot.nodes;
    if (!q) return nodes.slice(0, 12);
    return nodes
      .filter(
        (n) =>
          n.key.toLowerCase().includes(q) ||
          n.label.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [query, snapshot.nodes]);

  return (
    <div className="absolute right-3 top-14 z-10 w-64 rounded-[var(--radius-md)] border border-line bg-surface p-1">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nodes…"
        className="w-full rounded-[var(--radius-sm)] border-0 bg-transparent px-2 py-1.5 font-mono text-[12px] text-text outline-none placeholder:text-muted"
      />
      <ul className="max-h-56 overflow-y-auto">
        {matches.length === 0 ? (
          <li className="px-2 py-1.5 text-[12px] text-muted">No matches</li>
        ) : (
          matches.map((n) => (
            <li key={n._id}>
              <button
                type="button"
                onClick={() => onPick(n.key)}
                className="flex w-full flex-col items-start rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="truncate text-[12px] text-text">{n.label}</span>
                <span className="truncate font-mono text-[11px] text-muted">
                  {n.type} · {n.key}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function GraphCanvasInner({
  snapshot,
  exceptions,
  onNodeSelect,
  selectedNodeKey,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getNode } = useReactFlow();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const fittedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setDimensions({
        width: entry.contentRect.width || 800,
        height: entry.contentRect.height || 600,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const positions = useMemo(
    () => layoutGraph(snapshot, dimensions.width, dimensions.height),
    [snapshot, dimensions.width, dimensions.height],
  );

  const exceptionByNodeId = useMemo(() => {
    const map = new Map<string, "risk" | "warn">();
    for (const ex of exceptions) {
      map.set(ex.nodeId, ex.severity);
    }
    return map;
  }, [exceptions]);

  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) return ids;
    ids.add(hoveredNodeId);
    for (const edge of snapshot.edges) {
      if (edge.fromId === hoveredNodeId) ids.add(edge.toId);
      if (edge.toId === hoveredNodeId) ids.add(edge.fromId);
    }
    return ids;
  }, [hoveredNodeId, snapshot.edges]);

  const nodes = useMemo(
    () =>
      toFlowNodes(
        snapshot,
        positions,
        selectedNodeKey,
        highlightedIds,
        exceptionByNodeId,
      ),
    [snapshot, positions, selectedNodeKey, highlightedIds, exceptionByNodeId],
  );

  const edges = useMemo(
    () => toFlowEdges(snapshot, hoveredNodeId),
    [snapshot, hoveredNodeId],
  );

  useEffect(() => {
    if (!fittedRef.current && nodes.length > 0) {
      fittedRef.current = true;
      if (selectedNodeKey) return;
      requestAnimationFrame(() => fitView({ padding: 0.2 }));
    }
  }, [nodes.length, fitView, selectedNodeKey]);

  useEffect(() => {
    if (!selectedNodeKey) return;
    const node = snapshot.nodeByKey.get(selectedNodeKey);
    if (!node) return;
    const rfNode = getNode(node._id);
    if (rfNode) {
      const width = rfNode.measured?.width ?? rfNode.width ?? 36;
      const height = rfNode.measured?.height ?? rfNode.height ?? 48;
      setCenter(rfNode.position.x + width / 2, rfNode.position.y + height / 2, {
        zoom: 1.5,
        duration: 500,
      });
      return;
    }
    const pos = positions.get(node._id);
    if (!pos) return;
    setCenter(pos.x + 18, pos.y + 24, { zoom: 1.5, duration: 500 });
  }, [selectedNodeKey, snapshot.nodeByKey, positions, setCenter, getNode]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<KaryaNodeData>) => {
      onNodeSelect(node.data.nodeKey);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    setSearchOpen(false);
    onNodeSelect(null);
  }, [onNodeSelect]);

  const focusSearchHit = useCallback(
    (key: string) => {
      onNodeSelect(key);
      setSearchOpen(false);
    },
    [onNodeSelect],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full min-h-0 bg-surface-2">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={{
          style: { stroke: "var(--signal)", strokeWidth: 1 },
        }}
        nodeTypes={karyaNodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="var(--line)" gap={24} size={1} />
        <MiniMap
          position="bottom-right"
          style={{ backgroundColor: "var(--surface)", width: 120, height: 80 }}
          nodeColor="var(--muted)"
          maskColor="rgba(9,9,11,0.7)"
          pannable
          zoomable
        />
      </ReactFlow>
      <GraphToolbar
        searchOpen={searchOpen}
        onSearchToggle={() => setSearchOpen((v) => !v)}
      />
      {searchOpen ? (
        <GraphNodeSearch snapshot={snapshot} onPick={focusSearchHit} />
      ) : null}
      <GraphLegend />
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasInner {...props} />;
}
