"use client";

import { useState } from "react";
import { BuyerAgentChat, type BuyerAgentMessage } from "./BuyerAgentChat";
import { HttpRequestLog, type HttpLogEntry } from "./HttpRequestLog";
import { runBuyerDemo } from "@/lib/buyer-agent-script";
import { Button, PageHeader } from "@/components/ui";

export type BuyerAgentPanelProps = {
  onOrderPlaced?: (orderKey: string) => void;
};

export function BuyerAgentPanel({ onOrderPlaced }: BuyerAgentPanelProps) {
  const [messages, setMessages] = useState<BuyerAgentMessage[]>([]);
  const [entries, setEntries] = useState<HttpLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [orderKey, setOrderKey] = useState<string | null>(null);

  const onRunDemo = async () => {
    setRunning(true);
    setMessages([]);
    setEntries([]);
    setOrderKey(null);
    try {
      const result = await runBuyerDemo({
        onMessage: (m) => setMessages((prev) => [...prev, m]),
        onLog: (e) => setEntries((prev) => [...prev, e]),
      });
      setOrderKey(result.orderKey);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_done_${Date.now()}`,
          role: "system",
          text: `SalesOrder ${result.orderKey} created. Switch to Graph to see it live.`,
          at: new Date().toISOString(),
        },
      ]);
      onOrderPlaced?.(result.orderKey);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: "system",
          text: err instanceof Error ? err.message : "Demo failed",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Buyer Agent"
        subtitle="Simulated AI buyer interaction"
      />
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="flex min-h-0 flex-col">
          <BuyerAgentChat
            messages={messages}
            running={running}
            onRunDemo={() => {
              void onRunDemo();
            }}
          />
          {orderKey ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto justify-start rounded-none border-t border-line px-4 py-2 font-mono"
              onClick={() => onOrderPlaced?.(orderKey)}
            >
              Focus {orderKey}
            </Button>
          ) : null}
        </div>
        <HttpRequestLog entries={entries} />
      </div>
    </div>
  );
}
