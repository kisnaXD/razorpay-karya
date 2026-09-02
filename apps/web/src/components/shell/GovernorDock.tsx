"use client";

import { useEffect, useRef, useState } from "react";
import { useAgent } from "@/lib/agent-context";
import { useConsole } from "@/lib/console-context";
import {
  ApprovalCardList,
  usePendingApprovalCount,
} from "@/components/agent/ApprovalCardList";
import { AgentThread } from "@/components/agent/AgentThread";
import { AgentMessageInput } from "@/components/agent/AgentMessageInput";
import { AgentSelector } from "@/components/agent/AgentSelector";
import { ToolTrace } from "@/components/agent/ToolTrace";
import { DraftEmailCard } from "@/components/comms/DraftEmailCard";
import {
  sendCommsEmail,
  type AgentId,
  type EmailDraftDto,
} from "@/lib/api";
import { IconChevronDown } from "./icons";

type DockState = "collapsed" | "open";
type GovernorStatus = "idle" | "thinking" | "error";

const BASE_SUGGESTED_PROMPTS = [
  "Check exceptions",
  "Today's orders",
  "Review stock levels",
  "Pending approvals",
] as const;

const CHANGE_PROMPT = "What changed since I last checked?";

const AGENT_PLACEHOLDERS: Record<AgentId, string> = {
  governor: "Ask Karya anything...",
  finance: "Ask about invoices, collections, or cash flow...",
  procurement: "Ask about stock, vendors, or purchase orders...",
  sales: "Ask about pipeline, orders, or revenue...",
  operations: "Ask about work orders, production, or scheduling...",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

const PANEL_TRANSITION =
  "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]";

function StatusDot({
  status,
  pulse,
}: {
  status: GovernorStatus;
  pulse?: boolean;
}) {
  const tone =
    status === "thinking"
      ? "bg-signal"
      : status === "error"
        ? "bg-risk"
        : pulse
          ? "bg-signal"
          : "bg-muted";

  return (
    <span
      className={[
        "inline-block h-1.5 w-1.5 rounded-full",
        tone,
        status === "thinking" || pulse ? "animate-pulse" : "",
      ].join(" ")}
      aria-label={status}
    />
  );
}

function PromptChips({
  onPrompt,
  prompts,
}: {
  onPrompt: (prompt: string) => void;
  prompts: readonly string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPrompt(prompt)}
          className={`rounded-full border border-line/40 bg-surface-2/40 px-2.5 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-signal/50 hover:text-signal ${FOCUS}`}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function SendArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M8 12V4M8 4l-3.5 3.5M8 4l3.5 3.5" />
    </svg>
  );
}

export function GovernorDock() {
  const [dockState, setDockState] = useState<DockState>("collapsed");
  const [draftInput, setDraftInput] = useState("");
  const pendingCount = usePendingApprovalCount();
  const { unacknowledgedCount } = useConsole();
  const {
    thread,
    sending,
    error,
    llmConfigured,
    sendMessage,
    dockOpenNonce,
    selectedAgentId,
    setSelectedAgent,
    personas,
  } = useAgent();
  const panelRef = useRef<HTMLDivElement>(null);
  const collapsedInputRef = useRef<HTMLInputElement>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraftDto | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const isOpen = dockState === "open";
  const hasNewEvents = unacknowledgedCount > 0;
  const suggestedPrompts = hasNewEvents
    ? [CHANGE_PROMPT, ...BASE_SUGGESTED_PROMPTS]
    : BASE_SUGGESTED_PROMPTS;
  const agentPlaceholder =
    AGENT_PLACEHOLDERS[selectedAgentId] ?? AGENT_PLACEHOLDERS.governor;
  const collapsedPlaceholder = hasNewEvents
    ? `Karya found ${unacknowledgedCount} new item${unacknowledgedCount === 1 ? "" : "s"}…`
    : agentPlaceholder;

  useEffect(() => {
    if (dockOpenNonce > 0) {
      setDockState("open");
    }
  }, [dockOpenNonce]);
  const hasEntries = (thread?.entries.length ?? 0) > 0;
  const status: GovernorStatus = error
    ? "error"
    : sending
      ? "thinking"
      : "idle";
  const showIdle = !hasEntries && pendingCount === 0 && !sending && !error;
  const canSendCollapsed = draftInput.trim().length > 0 && !sending;

  useEffect(() => {
    if (!thread) return;
    for (const entry of [...thread.entries].reverse()) {
      if (entry.kind !== "tool" || entry.toolName !== "comms_draft_email") {
        continue;
      }
      const out = entry.output as EmailDraftDto | null;
      if (out?.messageKey && out.subject && out.bodyText) {
        setEmailDraft(out);
        break;
      }
    }
  }, [thread]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) {
        setDockState("collapsed");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dockState === "open") {
        e.preventDefault();
        setDockState("collapsed");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dockState]);

  async function sendDraft() {
    if (!emailDraft) return;
    setEmailBusy(true);
    try {
      await sendCommsEmail({
        messageKey: emailDraft.messageKey,
        explanation: "Send vendor chase email for PO-104",
      });
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleSend(message: string) {
    setDockState("open");
    setDraftInput("");
    await sendMessage(message);
  }

  function submitCollapsed() {
    const trimmed = draftInput.trim();
    if (!trimmed || sending) return;
    void handleSend(trimmed);
  }

  function openDock() {
    setDockState("open");
  }

  return (
    <>
      {isOpen ? (
        <div
          className={`fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] ${PANEL_TRANSITION}`}
          aria-hidden
        />
      ) : null}

      <div
        ref={panelRef}
        className={[
          "fixed bottom-6 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4",
          PANEL_TRANSITION,
        ].join(" ")}
      >
        <div
          className={[
            "flex w-full flex-col overflow-hidden",
            "border border-line/50 bg-surface/80 backdrop-blur-xl",
            "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
            PANEL_TRANSITION,
            isOpen
              ? "h-[min(70vh,500px)] rounded-2xl"
              : "h-[52px] rounded-2xl",
            !isOpen && hasNewEvents
              ? "animate-pulse ring-1 ring-signal/40"
              : "",
          ].join(" ")}
          role={isOpen ? "dialog" : undefined}
          aria-label="Karya AI"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <>
              <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line/40 px-4">
                <AgentSelector
                  personas={personas}
                  selected={selectedAgentId}
                  onSelect={setSelectedAgent}
                  disabled={sending}
                />
                <span className="text-[12px] font-medium tracking-tight text-text">
                  Karya AI
                </span>
                <StatusDot status={status} pulse={pendingCount > 0} />
                {pendingCount > 0 ? (
                  <span className="rounded-full bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal">
                    {pendingCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Minimize"
                  onClick={() => setDockState("collapsed")}
                  className={`ml-auto rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-text ${FOCUS}`}
                >
                  <IconChevronDown width={14} height={14} />
                </button>
              </header>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  {showIdle ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <p className="text-[13px] text-muted">
                        Ask Karya anything about orders, stock, or approvals.
                      </p>
                      {!llmConfigured ? (
                        <p className="text-[12px] text-muted/70">
                          Set OPENAI_API_KEY to enable the assistant loop.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <AgentThread />
                      <ToolTrace />
                      <ApprovalCardList />
                      {emailDraft ? (
                        <DraftEmailCard
                          draft={emailDraft}
                          sending={emailBusy}
                          onSend={() => void sendDraft()}
                        />
                      ) : null}
                      {error ? (
                        <p className="animate-fade-in-up text-[12px] leading-[1.45] text-risk">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-line/30 pt-2">
                  {showIdle || status === "idle" ? (
                    <PromptChips
                      prompts={suggestedPrompts}
                      onPrompt={(prompt) => {
                        void handleSend(prompt);
                      }}
                    />
                  ) : null}
                  <AgentMessageInput
                    disabled={sending}
                    placeholder={agentPlaceholder}
                    initialValue={draftInput}
                    autoFocus
                    onSend={(m) => void handleSend(m)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div
              className="flex h-full cursor-text items-center gap-3 px-4"
              onClick={() => collapsedInputRef.current?.focus()}
            >
              <input
                ref={collapsedInputRef}
                type="text"
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                onFocus={openDock}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCollapsed();
                  }
                }}
                placeholder={collapsedPlaceholder}
                className="min-w-0 flex-1 cursor-text bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
                aria-label={agentPlaceholder}
              />
              <StatusDot
                status={status}
                pulse={pendingCount > 0 || hasNewEvents}
              />
              {canSendCollapsed ? (
                <button
                  type="button"
                  aria-label="Send"
                  onClick={(e) => {
                    e.stopPropagation();
                    submitCollapsed();
                  }}
                  className={`rounded-lg bg-signal p-2 text-white transition-opacity hover:opacity-90 ${FOCUS}`}
                >
                  <SendArrowIcon />
                </button>
              ) : (
                <span
                  className="rounded-lg border border-line/40 p-2 text-muted opacity-50"
                  aria-hidden
                >
                  <SendArrowIcon />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
