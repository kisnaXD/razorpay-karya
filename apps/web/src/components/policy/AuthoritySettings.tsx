"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAuthority,
  updateAuthority,
  type AuthorityAction,
} from "@/lib/api";
import { EmptyState } from "@/components/ui";

type Effect = AuthorityAction["currentEffect"];

const EFFECT_COLUMNS: { effect: Effect; label: string }[] = [
  { effect: "allow", label: "Automatic" },
  { effect: "require_approval", label: "Needs Approval" },
  { effect: "deny", label: "Denied" },
];

export function AuthoritySettings() {
  const [actions, setActions] = useState<AuthorityAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAuthority();
      setActions(res.actions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleChange = async (row: AuthorityAction, effect: Effect) => {
    if (!row.policyKey || row.currentEffect === effect) return;
    setSavingKey(row.policyKey);
    try {
      await updateAuthority(row.policyKey, effect);
      setActions((prev) =>
        prev.map((a) =>
          a.policyKey === row.policyKey ? { ...a, currentEffect: effect } : a,
        ),
      );
      setToast(`Updated: ${row.label}`);
    } catch {
      setToast("Failed to update authority");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-4">
        <h2 className="text-md font-medium text-text">Agent Authority Settings</h2>
        <p className="mt-1 text-sm text-muted">
          Configure what Karya can do automatically vs. with approval
        </p>
      </div>

      {toast ? (
        <p className="mx-5 mt-3 rounded-[var(--radius-md)] border border-line bg-signal/10 px-3 py-2 text-sm text-signal">
          {toast}
        </p>
      ) : null}

      {loading ? (
        <p className="px-5 py-3 text-muted">Loading authority…</p>
      ) : actions.length === 0 ? (
        <EmptyState
          title="No authority actions"
          description="Authority rows appear once policies are seeded for this org."
        />
      ) : (
        <div className="px-5 py-4">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-line">
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="px-4 py-3 text-sm font-medium text-text">
                    Action
                  </th>
                  {EFFECT_COLUMNS.map((col) => (
                    <th
                      key={col.effect}
                      className="px-4 py-3 text-center text-sm font-medium text-text"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((row) => {
                  const rowKey = row.policyKey ?? `${row.action}:${row.label}`;
                  const busy = savingKey === row.policyKey;
                  return (
                    <tr
                      key={rowKey}
                      className="border-b border-line last:border-b-0 hover:bg-surface-2/60"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{row.label}</div>
                        <p className="mt-0.5 text-sm text-muted">
                          {row.description}
                          {row.threshold ? (
                            <span className="ml-1 text-muted">
                              · {row.threshold}
                            </span>
                          ) : null}
                        </p>
                      </td>
                      {EFFECT_COLUMNS.map((col) => {
                        const selected = row.currentEffect === col.effect;
                        const disabled = !row.policyKey || busy;
                        return (
                          <td key={col.effect} className="px-4 py-3 text-center">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${row.label}: ${col.label}`}
                              disabled={disabled}
                              onClick={() => void handleChange(row, col.effect)}
                              className={[
                                "inline-flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                                selected
                                  ? "border-signal bg-signal"
                                  : "border-line bg-surface",
                                disabled
                                  ? "cursor-not-allowed opacity-40"
                                  : "hover:border-signal/60",
                              ].join(" ")}
                            >
                              {selected ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
