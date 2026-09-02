"use client";

import {
  FALLBACK_AGENT_PERSONAS,
  type AgentId,
} from "@/lib/api";

export type AgentPersonaBadgeProps = {
  agentId: AgentId;
};

export function AgentPersonaBadge({ agentId }: AgentPersonaBadgeProps) {
  if (agentId === "governor") return null;

  const persona =
    FALLBACK_AGENT_PERSONAS.find((p) => p.id === agentId) ?? null;
  if (!persona) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted"
      data-agent={agentId}
    >
      <span aria-hidden>{persona.icon}</span>
      <span>{persona.shortName}</span>
    </span>
  );
}
