"use client";

type FailureImpactBlockProps = {
  summary: string;
};

export function FailureImpactBlock({ summary }: FailureImpactBlockProps) {
  return (
    <aside
      className="border-l-[3px] border-l-risk bg-risk/10 px-3 py-2 text-[13px] leading-[1.45] text-text"
      aria-label="Payment failure impact"
    >
      {summary}
    </aside>
  );
}
