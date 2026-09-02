"use client";

import { Button } from "@/components/ui";

export type BuyerAgentMessage = {
  id: string;
  role: "buyer" | "system";
  text: string;
  at: string;
};

export type BuyerAgentChatProps = {
  messages: BuyerAgentMessage[];
  running: boolean;
  onRunDemo: () => void;
};

export function BuyerAgentChat({
  messages,
  running,
  onRunDemo,
}: BuyerAgentChatProps) {
  return (
    <section className="flex min-h-0 flex-col border-r border-line bg-surface-2">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-[0.06em] text-muted">
            Conversation
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            External AI shopper · public /a2a/*
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={running}
          disabled={running}
          onClick={onRunDemo}
        >
          {running ? "Running…" : "Run demo query"}
        </Button>
      </header>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <li className="text-base text-muted">
            Scripted ACP-inspired buyer demo. Click Run demo query.
          </li>
        ) : null}
        {messages.map((m) => (
          <li
            key={m.id}
            className={[
              "rounded-[var(--radius-sm)] px-3 py-2 text-base",
              m.role === "buyer"
                ? "border-l-2 border-l-signal bg-surface text-text"
                : "text-muted",
            ].join(" ")}
          >
            <time className="mb-1 block font-mono text-xs tabular-nums text-muted">
              {new Date(m.at).toLocaleTimeString()}
            </time>
            <p className={m.role === "buyer" ? "font-mono text-sm" : ""}>
              {m.text}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
