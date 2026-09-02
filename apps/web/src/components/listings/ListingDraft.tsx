"use client";

import { useCallback, useEffect, useState } from "react";
import {
  draftListingCopy,
  fetchListing,
  publishListing,
  type ApiNodeFull,
} from "@/lib/api";
import { useConsole } from "@/lib/console-context";
import { formatInr } from "@/lib/format";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";

const CAPTION_LIMIT = 300;

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function ListingDraft() {
  const { reload } = useConsole();
  const [listing, setListing] = useState<ApiNodeFull | null>(null);
  const [sku, setSku] = useState<ApiNodeFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBullets, setEditBullets] = useState("");

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchListing("Listing:Diya-Large-Instagram");
      setListing(res.listing);
      setSku(res.sku);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const title =
    (typeof listing?.props.draft_title === "string"
      ? listing.props.draft_title
      : null) ?? null;
  const bullets = parseJsonArray(listing?.props.draft_bullets);
  const hashtags = parseJsonArray(listing?.props.draft_hashtags);
  const channel =
    typeof listing?.props.channel === "string"
      ? listing.props.channel
      : "instagram";
  const price =
    typeof listing?.props.priceInPaise === "number"
      ? listing.props.priceInPaise
      : typeof sku?.props.priceInPaise === "number"
        ? sku.props.priceInPaise
        : null;

  const displayTitle = editing ? editTitle : (title ?? "");
  const displayBullets = editing
    ? editBullets.split("\n").filter(Boolean)
    : bullets;
  const caption = [displayTitle, ...displayBullets].filter(Boolean).join("\n");
  const captionLen = caption.length;

  function startEdit() {
    setEditTitle(title ?? "");
    setEditBullets(bullets.join("\n"));
    setEditing(true);
  }

  function discardEdits() {
    setEditing(false);
    setEditTitle(title ?? "");
    setEditBullets(bullets.join("\n"));
    setStatus(null);
  }

  async function regenerate() {
    setBusy(true);
    setStatus(null);
    setEditing(false);
    try {
      await draftListingCopy({
        skuKey: "SKU:Diya-Large",
        channel: "instagram",
      });
      await load();
      setStatus("Draft regenerated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await publishListing({
        listingKey: "Listing:Diya-Large-Instagram",
        explanation: "Publish Diya-Large Instagram listing draft",
      });
      if ("approval" in res) {
        setStatus(`Approval ${res.approval._id} waiting in Governor rail.`);
      } else {
        setStatus("Published (auto-allowed).");
      }
      await reload();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  const isInstagram = channel.toLowerCase() === "instagram";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto" aria-label="Listings">
      <PageHeader
        title="Listings"
        subtitle="Diya-Large · Instagram channel"
        trailing={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !title}
              onClick={discardEdits}
            >
              Discard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !title}
              onClick={startEdit}
            >
              Edit
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={busy || !title}
              onClick={() => void publish()}
            >
              Publish
            </Button>
          </>
        }
      />

      {error ? <p className="px-5 py-3 text-sm text-muted">{error}</p> : null}
      {status ? (
        <p className="px-5 py-2 text-sm text-signal">{status}</p>
      ) : null}

      {!title ? (
        <EmptyState
          title="No listing drafts"
          description="Ask Governor to draft listing copy — or regenerate from the SKU."
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              disabled={busy}
              onClick={() => void regenerate()}
            >
              Regenerate
            </Button>
          }
        />
      ) : (
        <article
          className={[
            "mx-5 my-4 max-w-md overflow-hidden border border-line bg-surface",
            isInstagram
              ? "rounded-[var(--radius-lg)]"
              : "rounded-[var(--radius-md)]",
          ].join(" ")}
        >
          <div
            className={[
              "flex items-center justify-center border-b border-dashed border-line text-sm text-muted",
              isInstagram ? "aspect-[4/5]" : "aspect-video",
            ].join(" ")}
          >
            Product image
          </div>
          <div className="p-4">
            <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
              {channel}
              {price != null ? ` · ${formatInr(price)}` : null}
            </p>
            {editing ? (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-2 w-full rounded-[var(--radius-sm)] border border-line bg-transparent px-2 py-1 text-lg font-medium text-text transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            ) : (
              <h2 className="mt-2 text-lg font-medium text-text">
                {displayTitle}
              </h2>
            )}
            {editing ? (
              <textarea
                value={editBullets}
                onChange={(e) => setEditBullets(e.target.value)}
                rows={5}
                className="mt-3 w-full rounded-[var(--radius-sm)] border border-line bg-transparent px-2 py-1 text-base leading-[1.45] text-text transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-[1.45] text-text">
                {displayBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <p
              className={[
                "mt-2 text-right font-mono text-xs",
                captionLen > CAPTION_LIMIT ? "text-warn" : "text-muted",
              ].join(" ")}
            >
              {captionLen}/{CAPTION_LIMIT} characters
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <Badge key={tag} tone="accent">
                  {tag.startsWith("#") ? tag : `#${tag}`}
                </Badge>
              ))}
            </div>
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() => void regenerate()}
              >
                Regenerate
              </Button>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
