"use client";

import type { ApiException, InboxAction } from "@/lib/api";
import { Button } from "@/components/ui";

export type AgentInboxItemProps = {
  exception: ApiException;
  onAction: (action: InboxAction) => void;
};

const PRIORITY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-risk/15 text-risk",
  high: "bg-orange-500/15 text-orange-600",
  medium: "bg-warn/15 text-warn",
  low: "bg-teal/15 text-teal",
};

const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  procurement: "Procurement",
  sales: "Sales",
  inventory: "Inventory",
};

export function AgentInboxItem({ exception, onAction }: AgentInboxItemProps) {
  const priority = exception.priority ?? "low";
  const domain = exception.domain
    ? DOMAIN_LABEL[exception.domain] ?? exception.domain
    : null;
  const actions = exception.actions ?? [];

  return (
    <article
      className={[
        "border-b border-line border-l-4 bg-surface-2 px-4 py-3",
        "transition-colors duration-[var(--duration-fast)] hover:bg-surface",
        PRIORITY_BORDER[priority] ?? PRIORITY_BORDER.low,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={[
            "inline-flex rounded-full px-2 py-0.5 font-medium uppercase tracking-wide",
            PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.low,
          ].join(" ")}
        >
          {priority}
        </span>
        {domain ? (
          <>
            <span className="text-muted" aria-hidden>
              •
            </span>
            <span className="text-muted">{domain}</span>
          </>
        ) : null}
      </div>

      <h3 className="mt-2 text-base font-medium text-text">{exception.title}</h3>

      {exception.why ? (
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          <span className="font-medium text-text/80">Why: </span>
          {exception.why}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-[1.45] text-muted">{exception.detail}</p>
      )}

      {exception.recommendation ? (
        <p className="mt-1.5 text-sm leading-[1.45] text-muted">
          <span className="font-medium text-text/80">Recommendation: </span>
          {exception.recommendation}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <Button
              key={action.id}
              size="sm"
              variant={index === 0 ? "primary" : "secondary"}
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
