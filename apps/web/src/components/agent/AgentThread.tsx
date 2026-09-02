"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useAgent } from "@/lib/agent-context";
import type { AgentId, AgentThreadEntryDto } from "@/lib/api";
import { ReportBlock, isReportSpec } from "./ReportBlock";
import { ToolTraceRow } from "./ToolTraceRow";
import { ConsultTraceRow } from "./ConsultTraceRow";
import { AgentPersonaBadge } from "./AgentPersonaBadge";

function summarizeOutput(output: unknown): string | undefined {
  if (output == null) return undefined;
  if (typeof output === "object" && output !== null && "summary" in output) {
    return String((output as { summary: unknown }).summary);
  }
  if (typeof output === "object" && output !== null && "status" in output) {
    return `status=${String((output as { status: unknown }).status)}`;
  }
  try {
    const s = JSON.stringify(output);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return undefined;
  }
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-[15px] font-semibold text-text first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[14px] font-semibold text-text first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-[13px] font-medium text-text first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-text">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.45]">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-signal underline"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className="font-mono text-xs text-text">{children}</code>
      );
    }
    return (
      <code className="rounded bg-ink/40 px-1 font-mono text-xs text-text">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-ink/50 p-2 font-mono text-xs last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-line pl-3 text-muted last:mb-0">
      {children}
    </blockquote>
  ),
};

function UserBubble({ content }: { content: string }) {
  return (
    <div className="animate-fade-in-up flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-signal px-4 py-2.5 text-[13px] leading-[1.45] whitespace-pre-wrap text-white">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming,
  agentId,
}: {
  content: string;
  streaming?: boolean;
  agentId?: AgentId;
}) {
  return (
    <div className="animate-fade-in-up flex justify-start">
      <div className="flex max-w-[85%] flex-col gap-1">
        {agentId && agentId !== "governor" ? (
          <AgentPersonaBadge agentId={agentId} />
        ) : null}
        <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-2.5 text-[13px] leading-[1.5] text-text">
          {content ? (
            <ReactMarkdown components={markdownComponents}>
              {content}
            </ReactMarkdown>
          ) : null}
          {streaming ? (
            <span
              className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-signal align-text-bottom"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="animate-fade-in-up flex justify-start">
      <div
        className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-2.5"
        aria-label="Karya is typing"
      >
        <span className="animate-pulse text-[13px] tracking-widest text-muted">
          ●●●
        </span>
      </div>
    </div>
  );
}

type ToolEntry = Extract<AgentThreadEntryDto, { kind: "tool" }>;

function groupThreadEntries(entries: AgentThreadEntryDto[]) {
  const nestedByConsult = new Map<string, ToolEntry[]>();
  const topLevel: AgentThreadEntryDto[] = [];

  for (const entry of entries) {
    if (entry.kind === "tool" && entry.consultEntryId) {
      const list = nestedByConsult.get(entry.consultEntryId) ?? [];
      list.push(entry);
      nestedByConsult.set(entry.consultEntryId, list);
      continue;
    }
    topLevel.push(entry);
  }

  return { topLevel, nestedByConsult };
}

function renderToolRow(entry: ToolEntry) {
  return (
    <ToolTraceRow
      toolName={entry.toolName}
      sideEffectClass={entry.sideEffectClass}
      status={entry.status}
      explanation={entry.explanation}
      {...(summarizeOutput(entry.output)
        ? { outputSummary: summarizeOutput(entry.output)! }
        : {})}
    />
  );
}

export function AgentThread() {
  const { thread, streamingText, sending } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread?.entries.length, streamingText, sending]);

  const entries = thread?.entries ?? [];
  const { topLevel, nestedByConsult } = groupThreadEntries(entries);

  return (
    <div className="flex flex-col gap-3">
      {topLevel.map((entry) => {
        if (entry.kind === "user") {
          return <UserBubble key={entry.id} content={entry.content} />;
        }
        if (entry.kind === "assistant") {
          return (
            <AssistantBubble
              key={entry.id}
              content={entry.content}
              {...(entry.agentId ? { agentId: entry.agentId } : {})}
            />
          );
        }
        if (entry.kind === "consult") {
          const nested = nestedByConsult.get(entry.id) ?? [];
          return (
            <div key={entry.id} className="animate-fade-in-up flex justify-start">
              <ConsultTraceRow
                agentId={entry.agentId}
                question={entry.question}
                findings={entry.findings}
                status={entry.status}
                {...(entry.error != null ? { error: entry.error } : {})}
              >
                {nested.map((tool) => (
                  <div key={tool.id}>{renderToolRow(tool)}</div>
                ))}
              </ConsultTraceRow>
            </div>
          );
        }
        if (entry.output && isReportSpec(entry.output)) {
          return (
            <div key={entry.id} className="animate-fade-in-up flex justify-start">
              <ReportBlock report={entry.output} />
            </div>
          );
        }
        return (
          <div key={entry.id} className="animate-fade-in-up flex justify-start">
            {renderToolRow(entry)}
          </div>
        );
      })}
      {sending && streamingText ? (
        <AssistantBubble content={streamingText} streaming />
      ) : null}
      {sending && !streamingText ? <TypingIndicator /> : null}
      <div ref={bottomRef} />
    </div>
  );
}
