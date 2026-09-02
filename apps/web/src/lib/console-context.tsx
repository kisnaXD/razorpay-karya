"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  apiPost,
  seedOnceIfEmpty,
  type ApiException,
  type Bootstrap,
  type ConsoleView,
} from "@/lib/api";
import { loadGraphSnapshot, type GraphSnapshot } from "@/lib/graph-data";

export type AgentEventDto = {
  _id: string;
  orgId: string;
  type: "exception.new" | "exception.resolved";
  exceptionCode?: string;
  nodeKey?: string;
  title: string;
  detail?: string;
  createdAt: string;
  acknowledged: boolean;
};

export type ConsoleContextValue = {
  view: ConsoleView;
  setView: (view: ConsoleView) => void;
  selectedNodeKey: string | null;
  selectNode: (key: string | null) => void;
  focusNode: (key: string) => void;
  graph: GraphSnapshot | null;
  exceptions: ApiException[];
  bootstrap: Bootstrap | null;
  reload: () => Promise<void>;
  loading: boolean;
  error: string | null;
  unacknowledgedCount: number;
  agentEvents: AgentEventDto[];
  acknowledgeAgentEvents: () => Promise<void>;
};

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ConsoleView>("dashboard");
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [exceptions, setExceptions] = useState<ApiException[]>([]);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [agentEvents, setAgentEvents] = useState<AgentEventDto[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await seedOnceIfEmpty();
      const [graphSnapshot, bootstrapRes, exceptionsRes] = await Promise.all([
        loadGraphSnapshot(),
        api<Bootstrap>("/v1/bootstrap"),
        api<{ exceptions: ApiException[] }>("/v1/exceptions"),
      ]);
      setGraph(graphSnapshot);
      setBootstrap(bootstrapRes);
      setExceptions(exceptionsRes.exceptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load console");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await api<{
          events: AgentEventDto[];
          unacknowledgedCount: number;
        }>("/v1/agent/events");
        setAgentEvents(res.events);
        setUnacknowledgedCount(res.unacknowledgedCount);
      } catch {
        // Polling is best-effort — keep last known count.
      }
    };
    void fetchEvents();
    const id = setInterval(fetchEvents, 60_000);
    return () => clearInterval(id);
  }, []);

  const selectNode = useCallback((key: string | null) => {
    setSelectedNodeKey(key);
  }, []);

  const focusNode = useCallback((key: string) => {
    setSelectedNodeKey(key);
    setView("graph");
  }, []);

  const acknowledgeAgentEvents = useCallback(async () => {
    try {
      await apiPost<{ acknowledged: number }>("/v1/agent/events/ack", {});
      setAgentEvents([]);
      setUnacknowledgedCount(0);
    } catch {
      // Ack is best-effort.
    }
  }, []);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      view,
      setView,
      selectedNodeKey,
      selectNode,
      focusNode,
      graph,
      exceptions,
      bootstrap,
      reload,
      loading,
      error,
      unacknowledgedCount,
      agentEvents,
      acknowledgeAgentEvents,
    }),
    [
      view,
      selectedNodeKey,
      selectNode,
      focusNode,
      graph,
      exceptions,
      bootstrap,
      reload,
      loading,
      error,
      unacknowledgedCount,
      agentEvents,
      acknowledgeAgentEvents,
    ],
  );

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
