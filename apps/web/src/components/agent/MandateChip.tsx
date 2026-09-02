type MandateChipProps = {
  policyKey: string;
  detail: string;
};

export function MandateChip({ policyKey, detail }: MandateChipProps) {
  return (
    <span className="inline-block border border-teal px-2 py-0.5 font-mono text-[11px] text-teal">
      {policyKey} · {detail}
    </span>
  );
}
