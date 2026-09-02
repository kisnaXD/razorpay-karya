"use client";

import { AuditExplorer } from "@/components/money/AuditExplorer";
import { PageHeader } from "@/components/ui";

export function AuditLogPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Audit Log"
        subtitle="Money-trail events filtered by actor, side-effect, and amount."
      />
      <AuditExplorer />
    </div>
  );
}
