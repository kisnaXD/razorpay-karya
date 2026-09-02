"use client";

import { LedgerView } from "@/components/money/LedgerView";

/** LedgerView already owns PageHeader + KPIs; wrap without duplicating chrome. */
export function LedgerPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <LedgerView />
    </div>
  );
}
