"use client";

import { useState } from "react";
import { simulateWebhook } from "@/lib/api";
import { Button } from "@/components/ui";

type DemoControlsProps = {
  onDone: () => Promise<void>;
};

export function DemoControls({ onDone }: DemoControlsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <details
      className="mt-auto border-t border-line"
      aria-label="Demo controls"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-muted transition-colors duration-100 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
        Dev Tools
        <span className="ml-2 font-mono text-xs font-normal text-muted">
          local only
        </span>
      </summary>
      <div className="border-t border-line px-5 py-4">
        <p className="text-xs text-warn">
          Dev-only controls. Hidden in production — do not use on real money
          paths.
        </p>
        <p className="mt-2 text-sm text-muted">
          Force the Track 01 payment failure path on INV-90.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="mt-3"
          loading={busy}
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                await simulateWebhook({
                  event: "payment_link.expired",
                  paymentKey: "Payment:plink_7",
                });
                await onDone();
                setMessage(
                  "Simulated payment_link.expired — check Inbox + approvals.",
                );
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "Simulate failed",
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Simulating…" : "Simulate payment link expired (INV-90)"}
        </Button>
        {message ? (
          <p className="mt-2 text-sm leading-[1.45] text-muted">{message}</p>
        ) : null}
      </div>
    </details>
  );
}
