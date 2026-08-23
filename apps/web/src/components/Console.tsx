"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NodeIndex } from "@/components/graph/NodeIndex";
import { ExceptionList } from "@/components/inbox/ExceptionList";
import { AgentRail } from "@/components/shell/AgentRail";
import { AppShell } from "@/components/shell/AppShell";
import { NavRail } from "@/components/shell/NavRail";
import { StatusStrip } from "@/components/shell/StatusStrip";
import {
  api,
  seedOnceIfEmpty,
  neighborhoodKeysFrom,
  neighborhoodPath,
  type ApiException,
  type ApiNode,
  type Bootstrap,
  type Neighborhood,
} from "@/lib/api";

type ConsoleState = {
  bootstrap: Bootstrap;
  exceptions: ApiException[];
  nodes: ApiNode[];
  neighborhoodKeys: Set<string>;
};

function CanvasHeader({ orgLabel }: { orgLabel: string | null }) {
  return (
    <header className="flex shrink-0 items-baseline gap-3 border-b border-line px-4 py-3">
      <span className="font-display text-[20px] italic text-text">Karya</span>
      {orgLabel ? (
        <span className="text-[12px] text-muted">{orgLabel}</span>
      ) : null}
    </header>
  );
}

export function Console() {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await seedOnceIfEmpty();

        const [bootstrap, exceptionsRes, nodesRes, neighborhood] =
          await Promise.all([
            api<Bootstrap>("/v1/bootstrap"),
            api<{ exceptions: ApiException[] }>("/v1/exceptions"),
            api<{ nodes: ApiNode[] }>("/v1/nodes"),
            api<Neighborhood>(neighborhoodPath("SalesOrder:SO-218", 2)).catch(
              () => null,
            ),
          ]);

        if (cancelled) return;

        const neighborhoodKeys = neighborhoodKeysFrom(neighborhood);

        setState({
          bootstrap,
          exceptions: exceptionsRes.exceptions,
          nodes: nodesRes.nodes,
          neighborhoodKeys,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load console");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const nodeKeyById = useMemo(() => {
    const map = new Map<string, string>();
    if (!state) return map;
    for (const node of state.nodes) {
      map.set(node._id, node.key);
    }
    return map;
  }, [state]);

  const exceptionCount = state?.bootstrap.exceptionCount ?? 0;
  const cashInPaise = state?.bootstrap.cashInPaise ?? 0;
  const orgLabel = state?.bootstrap.org.label ?? null;

  let canvasBody: ReactNode;
  if (error) {
    canvasBody = (
      <p className="px-4 py-3 text-muted">
        {error} — start the API on port 4000, then reload.
      </p>
    );
  } else if (!state) {
    canvasBody = <p className="px-4 py-3 text-muted">Loading graph…</p>;
  } else {
    canvasBody = (
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <ExceptionList
          exceptions={state.exceptions}
          nodeKeyById={nodeKeyById}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
        <NodeIndex
          nodes={state.nodes}
          neighborhoodKeys={state.neighborhoodKeys}
          selectedKey={selectedKey}
        />
      </div>
    );
  }

  return (
    <AppShell
      nav={<NavRail exceptionCount={exceptionCount} />}
      canvas={
        <div className="flex h-full min-h-0 flex-col">
          <CanvasHeader orgLabel={orgLabel} />
          {canvasBody}
        </div>
      }
      agent={<AgentRail exceptionCount={exceptionCount} />}
      status={
        <StatusStrip
          cashInPaise={cashInPaise}
          exceptionCount={exceptionCount}
        />
      }
    />
  );
}
