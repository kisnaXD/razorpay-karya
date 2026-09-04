"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAgent } from "@/lib/agent-context";
import {
  ApprovalCardList,
  usePendingApprovalCount,
} from "@/components/agent/ApprovalCardList";
import { AgentThread } from "@/components/agent/AgentThread";
import { AgentMessageInput } from "@/components/agent/AgentMessageInput";
import { ToolTrace } from "@/components/agent/ToolTrace";
import { DraftEmailCard } from "@/components/comms/DraftEmailCard";
import { sendCommsEmail, type EmailDraftDto } from "@/lib/api";

type AgentRailProps = {
  exceptionCount: number;
};

type GovernorStatus = "idle" | "thinking" | "error";

const SUGGESTED_PROMPTS = [
  "Check exceptions",
  "Draft vendor email",
  "Review stock levels",
] as const;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

function StatusDot({ status }: { status: GovernorStatus }) {
  const tone =
    status === "thinking"
      ? "bg-signal"
      : status === "error"
        ? "bg-risk"
        : "bg-muted";

  return (
    <span
      className={[
        "inline-block h-1.5 w-1.5 rounded-full",
        tone,
        status === "thinking" ? "animate-pulse" : "",
      ].join(" ")}
      aria-label={status}
    />
  );
}

function RailSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          {title}
        </h3>
        {badge != null && badge > 0 ? (
          <span className="rounded-full bg-signal/10 px-1.5 py-px text-[11px] text-signal tabular-nums">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function IdleEmptyState({
  exceptionCount,
  onPrompt,
}: {
  exceptionCount: number;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="text-[13px] text-muted">Governor idle</p>
      {exceptionCount > 0 ? (
        <p className="text-[12px] text-muted">
          {exceptionCount === 1
            ? "One exception needs you."
            : `${exceptionCount} exceptions need you.`}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt(prompt)}
            className={`rounded-full border border-line px-3 py-1.5 text-[12px] text-muted transition-colors duration-100 hover:border-signal hover:text-signal ${FOCUS}`}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentRail({ exceptionCount }: AgentRailProps) {
  const pendingCount = usePendingApprovalCount();
  const { thread, sending, error, llmConfigured, sendMessage } = useAgent();
  const hasEntries = (thread?.entries.length ?? 0) > 0;
  const [emailDraft, setEmailDraft] = useState<EmailDraftDto | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const showIdle =
    !hasEntries && pendingCount === 0 && !sending && !error && !emailDraft;

  const status: GovernorStatus = error
    ? "error"
    : sending
      ? "thinking"
      : "idle";

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

  return (
    <div className="flex h-full flex-col border-l-[2px] border-l-copper">
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-text">
          Governor
        </h2>
        <StatusDot status={status} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <RailSection title="Tool traces">
          <ToolTrace />
        </RailSection>
        {showIdle ? (
          <IdleEmptyState
            exceptionCount={exceptionCount}
            onPrompt={(prompt) => void sendMessage(prompt)}
          />
        ) : (
          <>
            <RailSection title="Conversation">
              <AgentThread />
            </RailSection>
            <RailSection title="Approvals" badge={pendingCount}>
              <ApprovalCardList />
            </RailSection>
            {emailDraft ? (
              <RailSection title="Email drafts">
                <DraftEmailCard
                  draft={emailDraft}
                  sending={emailBusy}
                  onSend={() => void sendDraft()}
                />
              </RailSection>
            ) : null}
          </>
        )}
        {error ? (
          <p className="px-4 py-3 text-[12px] leading-[1.45] text-risk">{error}</p>
        ) : null}
        {!llmConfigured ? (
          <p className="px-4 py-3 text-[12px] leading-[1.45] text-muted">
            Set OPENAI_API_KEY to enable the Governor loop.
          </p>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-line">
        <AgentMessageInput
          disabled={sending}
          onSend={(m, attachments) => void sendMessage(m, attachments)}
        />
      </div>
      <footer className="shrink-0 px-4 py-2 text-[11px] leading-[1.45] text-muted/70">
        Money actions need approval when policy requires it.
      </footer>
    </div>
  );
}
