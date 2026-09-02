"use client";

import { useState, type KeyboardEvent } from "react";

type AgentMessageInputProps = {
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  initialValue?: string;
  onSend: (message: string) => void;
};

function SendArrowIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 12V4M8 4l-3.5 3.5M8 4l3.5 3.5" />
    </svg>
  );
}

export function AgentMessageInput({
  disabled,
  placeholder = "Ask Karya anything...",
  autoFocus,
  initialValue = "",
  onSend,
}: AgentMessageInputProps) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="flex items-end gap-2 rounded-xl border border-line/30 bg-surface-2/50 px-3 py-2.5">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          autoFocus={autoFocus}
          className="min-h-[24px] max-h-[120px] min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-[1.45] text-text outline-none placeholder:text-muted disabled:opacity-50"
        />
        {hasText ? (
          <button
            type="button"
            aria-label="Send"
            disabled={disabled}
            onClick={submit}
            className="shrink-0 rounded-lg bg-signal p-2 text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <SendArrowIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
}
