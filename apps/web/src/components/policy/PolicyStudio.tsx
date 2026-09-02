"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAuditEvents,
  fetchPolicies,
  togglePolicy,
  type AuditEventDto,
  type PolicyDto,
} from "@/lib/api";
import { MandateChip } from "@/components/agent/MandateChip";
import { AuthoritySettings } from "@/components/policy/AuthoritySettings";
import { Badge, EmptyState, PageHeader, Switch, type BadgeTone } from "@/components/ui";
import { formatInrExact } from "@/lib/format";

type PolicyEvalPayload = {
  proposed?: { action?: string };
  evaluation?: { finalDecision?: string };
};

type PolicyRule = { field: string; op: string; value?: unknown };

type StudioTab = "rules" | "authority";

function parsePayload(event: AuditEventDto): PolicyEvalPayload | null {
  try {
    return JSON.parse(String(event.props.payload_json)) as PolicyEvalPayload;
  } catch {
    return null;
  }
}

function humanField(field: string): string {
  if (field === "amountInPaise") return "amount";
  const last = field.split(".").pop() ?? field;
  return last.replaceAll("_", " ");
}

function humanOp(op: string): string {
  switch (op) {
    case "eq":
      return "=";
    case "neq":
      return "≠";
    case "lte":
      return "<=";
    case "gte":
      return ">=";
    case "in":
      return "in";
    case "truthy":
      return "is set";
    default:
      return op;
  }
}

function formatRuleValue(field: string, value: unknown): string {
  if (field === "amountInPaise" && typeof value === "number") {
    return formatInrExact(value);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return String(value);
}

function formatCondition(rule: PolicyRule): string {
  const field = humanField(rule.field);
  if (rule.op === "truthy") return `${field} is set`;
  if (rule.op === "in") {
    return `${field} in ${formatRuleValue(rule.field, rule.value)}`;
  }
  return `${field} ${humanOp(rule.op)} ${formatRuleValue(rule.field, rule.value)}`;
}

function formatEffect(effect: string): string {
  return effect === "require_approval" ? "require approval" : effect;
}

function formatRules(rules: PolicyRule[], effect: string): string {
  const effectLabel = formatEffect(effect);
  if (rules.length === 0) return `Always → ${effectLabel}`;
  return `When ${rules.map(formatCondition).join(" and ")} → ${effectLabel}`;
}

function decisionTone(decision: string): BadgeTone {
  if (decision === "allow") return "success";
  if (decision === "deny") return "risk";
  if (decision === "require_approval") return "warn";
  return "muted";
}

function PolicyRulesPanel() {
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [history, setHistory] = useState<AuditEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [policyList, auditEvents] = await Promise.all([
        fetchPolicies(),
        fetchAuditEvents(20),
      ]);
      setPolicies(policyList);
      setHistory(
        auditEvents.filter((e) => e.props.event_type === "policy.evaluated"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (key: string, enabled: boolean) => {
    setToggling(key);
    try {
      await togglePolicy(key, enabled);
      await load();
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return <p className="px-5 py-3 text-muted">Loading policies…</p>;
  }

  return (
    <>
      {policies.length === 0 ? (
        <EmptyState
          title="No policies"
          description="Policy rules will appear here once they are defined for this org."
        />
      ) : (
        <div className="space-y-3 px-5 py-4">
          {policies.map(({ node, compiled }) => {
            const enabled = node.props.enabled !== false;
            const effect = compiled.effect;
            return (
              <section
                key={node.key}
                className="rounded-[var(--radius-md)] border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-md font-medium text-text">{node.label}</h3>
                      <Badge tone={decisionTone(effect)}>
                        {formatEffect(effect)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-base text-muted">
                      {compiled.description}
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={toggling === node.key}
                    onChange={(next) => void handleToggle(node.key, next)}
                    label="Enabled"
                  />
                </div>
                <p className="mt-3 text-sm text-text">
                  {formatRules(compiled.rules, effect)}
                </p>
              </section>
            );
          })}
        </div>
      )}

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted">
          Recent decisions
        </h3>
        <ul className="mt-3 flex flex-col gap-3">
          {history.length === 0 ? (
            <li className="text-base text-muted">No evaluations yet.</li>
          ) : (
            history.map((event) => {
              const payload = parsePayload(event);
              const action = payload?.proposed?.action ?? "unknown";
              const decision = payload?.evaluation?.finalDecision ?? "unknown";
              const at = String(event.props.at);
              return (
                <li
                  key={event.key}
                  className="flex flex-wrap items-center gap-2 text-base"
                >
                  <span className="font-mono text-muted">{action}</span>
                  <span className="text-muted">→</span>
                  <Badge tone={decisionTone(decision)}>
                    {formatEffect(decision)}
                  </Badge>
                  <span className="text-sm text-muted">
                    {new Date(at).toLocaleString("en-IN")}
                  </span>
                  {decision === "allow" ? (
                    <MandateChip
                      policyKey={action}
                      detail="approved autonomously"
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </>
  );
}

export function PolicyStudio() {
  const [tab, setTab] = useState<StudioTab>("rules");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader title="Policy Studio" />

      <div className="flex gap-1 border-b border-line px-5">
        {(
          [
            { id: "rules", label: "Policy Rules" },
            { id: "authority", label: "Agent Authority" },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={[
                "border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-signal font-medium text-signal"
                  : "border-transparent text-muted hover:text-text",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "rules" ? <PolicyRulesPanel /> : <AuthoritySettings />}
    </div>
  );
}
