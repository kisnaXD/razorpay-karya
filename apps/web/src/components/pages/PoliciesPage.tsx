"use client";

import { PolicyStudio } from "@/components/policy/PolicyStudio";

/** PolicyStudio already owns PageHeader; wrap without duplicating chrome. */
export function PoliciesPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PolicyStudio />
    </div>
  );
}
