"use client";

import { useEffect, useMemo, useState } from "react";
import { NodeIndex } from "@/components/graph/NodeIndex";
import { ExceptionList } from "@/components/inbox/ExceptionList";
import { AgentRail } from "@/components/shell/AgentRail";
import { AppShell } from "@/components/shell/AppShell";
import { NavRail } from "@/components/shell/NavRail";
import { StatusStrip } from "@/components/shell/StatusStrip";
import {
  api,
  seedOnceIfEmpty,
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
            api<Neighborhood>(
              "/v1/neighborhood?key=SalesOrder:SO-218&depth=2",
            ).catch(() => null),
          ]);

        if (cancelled) return;

        const neighborhoodKeys = new Set<string>();
        if (neighborhood) {
          neighborhoodKeys.add(neighborhood.center.key);
          for (const node of neighborhood.nodes) {
            neighborhoodKeys.add(node.key);
          }
        }

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

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink px-6 text-muted">
        <p>
          Console offline — {error}. Start the API on port 4000, then reload.
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink text-muted">
        Loading graph…
      </div>
    );
  }

  const { bootstrap, exceptions, nodes, neighborhoodKeys } = state;

  return (
    <AppShell
      nav={<NavRail exceptionCount={bootstrap.exceptionCount} />}
      canvas={
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-baseline gap-3 border-b border-line px-4 py-3">
            <span className="font-display text-[18px] italic text-text">
              Karya
            </span>
            <span className="text-[12px] text-muted">{bootstrap.org.label}</span>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-2">
            <ExceptionList
              exceptions={exceptions}
              nodeKeyById={nodeKeyById}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
            <NodeIndex
              nodes={nodes}
              neighborhoodKeys={neighborhoodKeys}
              selectedKey={selectedKey}
            />
          </div>
        </div>
      }
      agent={<AgentRail exceptionCount={bootstrap.exceptionCount} />}
      status={
        <StatusStrip
          cashInPaise={bootstrap.cashInPaise}
          exceptionCount={bootstrap.exceptionCount}
        />
      }
    />
  );
}
