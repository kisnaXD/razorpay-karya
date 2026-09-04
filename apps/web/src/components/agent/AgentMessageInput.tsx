"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { AgentAttachment } from "@/lib/api";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  "image/*,.pdf,.csv,.txt,text/plain,text/csv,application/pdf";

type PendingAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  previewUrl?: string;
};

type AgentMessageInputProps = {
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  initialValue?: string;
  onSend: (message: string, attachments?: AgentAttachment[]) => void;
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

function PaperclipIcon() {
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
      <path d="M10.5 4.5l-5.2 5.2a2 2 0 002.8 2.8l5.4-5.4a3.2 3.2 0 00-4.5-4.5L3.5 8.1a4.4 4.4 0 006.2 6.2l4.3-4.3" />
    </svg>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",")
        ? result.slice(result.indexOf(",") + 1)
        : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function AgentMessageInput({
  disabled,
  placeholder = "Ask Karya anything...",
  autoFocus,
  initialValue = "",
  onSend,
}: AgentMessageInputProps) {
  const [value, setValue] = useState(initialValue);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (disabled) return;
    if (!trimmed && attachments.length === 0) return;

    const payload: AgentAttachment[] = attachments.map(
      ({ name, type, size, data }) => ({ name, type, size, data }),
    );
    onSend(trimmed, payload.length > 0 ? payload : undefined);
    setValue("");
    setAttachments([]);
    setFileError(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFileError(null);

    const next: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`"${file.name}" exceeds the 10MB limit`);
        continue;
      }
      try {
        const data = await readFileAsBase64(file);
        const isImage = file.type.startsWith("image/");
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          data,
          ...(isImage ? { previewUrl: URL.createObjectURL(file) } : {}),
        });
      } catch {
        setFileError(`Could not read "${file.name}"`);
      }
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const hasText = value.trim().length > 0;
  const canSend = (hasText || attachments.length > 0) && !disabled;

  return (
    <div className="shrink-0 px-3 pb-3">
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-line/30 bg-surface-2/40 p-2">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="relative flex max-w-[180px] items-center gap-2 rounded-lg border border-line/40 bg-surface-2/80 px-2 py-1.5"
            >
              {file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-ink/30 text-[11px] text-muted">
                  FILE
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-text">{file.name}</p>
                <p className="text-[10px] text-muted">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => removeAttachment(file.id)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line/50 bg-surface text-[10px] text-muted hover:text-text"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {fileError ? (
        <p className="mb-1.5 px-0.5 text-[11px] text-risk">{fileError}</p>
      ) : null}

      <div className="flex items-end gap-2 rounded-xl border border-line/30 bg-surface-2/50 px-3 py-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void onFilesSelected(e.target.files)}
        />
        <button
          type="button"
          aria-label="Attach files"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="mb-0.5 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <PaperclipIcon />
        </button>
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
        {canSend ? (
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
