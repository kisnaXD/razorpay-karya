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
  FALLBACK_AGENT_PERSONAS,
  LlmNotConfiguredError,
  fetchAgentPersonas,
  fetchAgentThread,
  resumeAgent,
  sendAgentMessage,
  type AgentId,
  type AgentPersonaDto,
  type AgentStreamEvent,
  type AgentThreadDto,
} from "@/lib/api";
import { useConsole } from "@/lib/console-context";

export type AgentContextValue = {
  thread: AgentThreadDto | null;
  streamingText: string;
  sending: boolean;
  llmConfigured: boolean;
  error: string | null;
  /** Increments when callers request the Governor dock open. */
  dockOpenNonce: number;
  selectedAgentId: AgentId;
  setSelectedAgent: (id: AgentId) => void;
  personas: AgentPersonaDto[];
  refresh: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  resumeFromApproval: (approvalId: string) => Promise<void>;
  requestOpenDock: () => void;
};

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const { selectedNodeKey } = useConsole();
  const [thread, setThread] = useState<AgentThreadDto | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [sending, setSending] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockOpenNonce, setDockOpenNonce] = useState(0);
  const [selectedAgentId, setSelectedAgent] = useState<AgentId>("governor");
  const [personas, setPersonas] = useState<AgentPersonaDto[]>(
    FALLBACK_AGENT_PERSONAS,
  );

  const requestOpenDock = useCallback(() => {
    setDockOpenNonce((n) => n + 1);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAgentThread();
      setThread(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    fetchAgentPersonas().then(setPersonas);
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      setSending(true);
      setStreamingText("");
      setError(null);

      const optimisticId = `local-user-${Date.now()}`;
      const now = new Date().toISOString();
      setThread((prev) => {
        const userEntry: AgentThreadDto["entries"][number] = {
          id: optimisticId,
          kind: "user",
          content: message,
          contextNodeKey: selectedNodeKey ?? null,
          createdAt: now,
        };
        if (!prev) {
          return {
            _id: "local",
            orgId: "org_arka",
            entries: [userEntry],
            pending: null,
            updatedAt: now,
          };
        }
        return {
          ...prev,
          entries: [...prev.entries, userEntry],
          updatedAt: now,
        };
      });

      try {
        const onEvent = (ev: AgentStreamEvent) => {
          if (ev.type === "thread" || ev.type === "done") {
            setThread(ev.thread);
          }
          if (ev.type === "done") {
            setStreamingText("");
          }
          if (ev.type === "text-delta") {
            setStreamingText((prev) => prev + ev.delta);
          }
        };
        const final = await sendAgentMessage(message, {
          ...(selectedNodeKey ? { contextNodeKey: selectedNodeKey } : {}),
          agentId: selectedAgentId,
          onEvent,
        });
        setThread(final);
        setStreamingText("");
        setLlmConfigured(true);
      } catch (err) {
        if (err instanceof LlmNotConfiguredError) {
          setLlmConfigured(false);
          setError("Governor needs OPENAI_API_KEY — set it in .env and restart the API.");
        } else {
          setError(err instanceof Error ? err.message : "Agent error");
        }
        setStreamingText("");
      } finally {
        setSending(false);
      }
    },
    [selectedNodeKey, selectedAgentId],
  );

  const resumeFromApproval = useCallback(async (approvalId: string) => {
    try {
      const result = await resumeAgent(approvalId);
      setThread(result.thread);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo<AgentContextValue>(
    () => ({
      thread,
      streamingText,
      sending,
      llmConfigured,
      error,
      dockOpenNonce,
      selectedAgentId,
      setSelectedAgent,
      personas,
      refresh,
      sendMessage,
      resumeFromApproval,
      requestOpenDock,
    }),
    [
      thread,
      streamingText,
      sending,
      llmConfigured,
      error,
      dockOpenNonce,
      selectedAgentId,
      personas,
      refresh,
      sendMessage,
      resumeFromApproval,
      requestOpenDock,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within AgentProvider");
  }
  return ctx;
}
