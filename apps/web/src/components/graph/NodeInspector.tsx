"use client";

import { useEffect, useState } from "react";
import {
  api,
  neighborhoodPath,
  type ApiEdge,
  type ApiNodeFull,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import { useConsole } from "@/lib/console-context";
import { Badge } from "@/components/ui/Badge";

type NodeInspectorProps = {
  nodeKey: string | null;
  onClose: () => void;
};

type NeighborhoodResponse = {
  center: ApiNodeFull;
  nodes: ApiNodeFull[];
  edges: ApiEdge[];
};

function formatPropValue(key: string, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && key.endsWith("InPaise")) {
    return formatInr(value);
  }
  if (
    typeof value === "string" &&
    (key.endsWith("At") || key.endsWith("_date") || key.includes("date"))
  ) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("en-IN");
  }
  return String(value);
}

export function NodeInspector({ nodeKey, onClose }: NodeInspectorProps) {
  const { graph, focusNode } = useConsole();
  const [renderedKey, setRenderedKey] = useState<string | null>(nodeKey);
  const [open, setOpen] = useState(false);
  const [hood, setHood] = useState<NeighborhoodResponse | null>(null);
  const [hoodFailed, setHoodFailed] = useState(false);

  useEffect(() => {
    if (nodeKey) {
      setRenderedKey(nodeKey);
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
    setOpen(false);
    const t = window.setTimeout(() => setRenderedKey(null), 200);
    return () => window.clearTimeout(t);
  }, [nodeKey]);

  const activeKey = nodeKey ?? renderedKey;
  const node = activeKey ? graph?.nodeByKey.get(activeKey) : undefined;

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setHoodFailed(false);
    setHood(null);
    void api<NeighborhoodResponse>(neighborhoodPath(activeKey, 1))
      .then((res) => {
        if (!cancelled) setHood(res);
      })
      .catch(() => {
        if (!cancelled) setHoodFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  useEffect(() => {
    if (!renderedKey) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, renderedKey]);

  if (!renderedKey || !node) return null;

  const propsEntries = Object.entries(node.props ?? {}).filter(
    ([, v]) => v !== null,
  );

  const nodeById = graph?.nodeById ?? new Map<string, ApiNodeFull>();
  const links = (hood?.edges ?? []).map((edge) => {
    const neighborId =
      edge.fromId === node._id ? edge.toId : edge.fromId;
    const neighbor = nodeById.get(neighborId) ?? hood?.nodes.find((n) => n._id === neighborId);
    return {
      edgeType: edge.type,
      neighborKey: neighbor?.key ?? neighborId,
    };
  });

  return (
    <aside
      className={[
        "fixed right-[360px] top-0 bottom-[32px] z-30 w-[320px]",
        "border-l border-line bg-surface",
        "transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out)]",
        open ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
      aria-label="Node inspector"
      aria-hidden={!open}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] text-muted">{node.key}</div>
          <div className="mt-1 truncate text-[15px] text-text">{node.label}</div>
          <Badge tone="muted" className="mt-2">
            {node.type}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-text"
          aria-label="Close inspector"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: "calc(100% - 120px)" }}>
        <section className="mb-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            Properties
          </h3>
          {propsEntries.length === 0 ? (
            <p className="text-[12px] text-muted">No properties</p>
          ) : (
            <dl className="space-y-0">
              {propsEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-3 border-b border-line py-1.5"
                >
                  <dt className="text-[12px] text-muted">{key}</dt>
                  <dd className="text-right font-mono text-[12px] text-text">
                    {formatPropValue(key, value as string | number | boolean)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            Edges
          </h3>
          {hoodFailed ? (
            <p className="text-[12px] text-muted">Could not load links</p>
          ) : links.length === 0 ? (
            <p className="text-[12px] text-muted">No links</p>
          ) : (
            <ul className="space-y-1">
              {links.map((link, i) => (
                <li key={`${link.edgeType}-${link.neighborKey}-${i}`} className="text-[12px]">
                  <span className="text-muted">{link.edgeType}</span>
                  <span className="text-muted"> → </span>
                  <button
                    type="button"
                    onClick={() => focusNode(link.neighborKey)}
                    className="font-mono text-signal hover:underline"
                  >
                    {link.neighborKey}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="absolute bottom-0 left-0 right-0 flex gap-2 border-t border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={() => focusNode(renderedKey)}
          className="border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-text hover:bg-surface"
        >
          Focus graph
        </button>
        <button
          type="button"
          onClick={() => console.log("impact:", renderedKey)}
          className="border border-line bg-transparent px-3 py-1.5 text-[12px] text-muted hover:text-text"
        >
          View impact
        </button>
      </footer>
    </aside>
  );
}
