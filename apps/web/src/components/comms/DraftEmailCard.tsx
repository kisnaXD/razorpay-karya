"use client";

import type { EmailDraftDto } from "@/lib/api";

type DraftEmailCardProps = {
  draft: EmailDraftDto;
  onSend?: () => void;
  sending?: boolean;
};

export function DraftEmailCard({
  draft,
  onSend,
  sending = false,
}: DraftEmailCardProps) {
  return (
    <article className="border-l-[3px] border-l-copper bg-surface p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
        Email draft
      </p>
      <h3 className="mt-1 text-[14px] font-medium text-text">{draft.subject}</h3>
      <p className="mt-1 font-mono text-[11px] text-muted">{draft.messageKey}</p>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-[12px] leading-[1.45] text-muted">
        {draft.bodyText}
      </pre>
      {onSend ? (
        <button
          type="button"
          disabled={sending}
          onClick={onSend}
          className="mt-3 border border-teal px-3 py-1 text-[13px] text-teal hover:bg-teal/10 disabled:opacity-50"
        >
          Send (approval)
        </button>
      ) : null}
    </article>
  );
}
