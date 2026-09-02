import type { Db } from "mongodb";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { draftListingForSku, type ListingDraftCopy } from "@karya/agents";
import { createApproval, type CreateApprovalResult } from "./approvals.js";
import { writeAuditEvent } from "./audit.js";

const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function findListingForSkuChannel(
  store: GraphStore,
  orgId: string,
  skuKey: string,
  channel: "instagram" | "catalog",
): Promise<NodeRecord | null> {
  const sku = await store.getNodeByKey(orgId, skuKey);
  if (!sku) return null;
  const hood = await store.neighborhood(orgId, sku._id, 1);
  for (const edge of hood.edges) {
    if (edge.type !== "LISTS" || edge.toId !== sku._id || edge.validTo !== null) {
      continue;
    }
    const listing =
      hood.nodes.find((n) => n._id === edge.fromId) ??
      (await store.getNode(orgId, edge.fromId));
    if (
      listing?.type === "Listing" &&
      listing.props.channel === channel
    ) {
      return listing;
    }
  }
  return null;
}

export async function draftListing(
  store: GraphStore,
  orgId: string,
  input: {
    skuKey: string;
    channel: "instagram" | "catalog";
    actor: string;
  },
): Promise<{ listingKey: string; draft: ListingDraftCopy }> {
  const listing = await findListingForSkuChannel(
    store,
    orgId,
    input.skuKey,
    input.channel,
  );
  if (!listing) {
    throw new Error(
      `Listing not found for ${input.skuKey} channel ${input.channel}`,
    );
  }

  const draft = await draftListingForSku(store, orgId, input.skuKey);
  const updated = await store.upsertNode({
    _id: listing._id,
    orgId: listing.orgId,
    type: listing.type,
    key: listing.key,
    label: listing.label,
    props: {
      ...listing.props,
      draft_title: draft.title,
      draft_bullets: JSON.stringify(draft.bullets),
      draft_hashtags: JSON.stringify(draft.hashtags),
      draft_generated_at: new Date().toISOString(),
    },
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "listing.drafted",
    actor: input.actor,
    sideEffectClass: "draft",
    payload: {
      listingKey: updated.key,
      skuKey: input.skuKey,
      channel: input.channel,
    },
    aboutNodeIds: [updated._id],
  });

  return { listingKey: updated.key, draft };
}

export async function requestPublishListing(
  db: Db,
  store: GraphStore,
  orgId: string,
  input: { listingKey: string; explanation: string; actor: string },
): Promise<CreateApprovalResult> {
  return createApproval(db, store, orgId, {
    action: "listing.publish",
    orgId,
    targetNodeKey: input.listingKey,
    explanation: input.explanation,
    proposedBy: input.actor,
  });
}

export async function executePublishListing(
  store: GraphStore,
  orgId: string,
  listingKey: string,
  actor: string,
): Promise<NodeRecord> {
  const listing = await store.getNodeByKey(orgId, listingKey);
  if (!listing || listing.type !== "Listing") {
    throw new Error(`Listing not found: ${listingKey}`);
  }

  const updated = await store.upsertNode({
    _id: listing._id,
    orgId: listing.orgId,
    type: listing.type,
    key: listing.key,
    label: listing.label,
    props: {
      ...listing.props,
      status: "published",
      published_at: new Date().toISOString(),
    },
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "listing.published",
    actor,
    sideEffectClass: "external",
    payload: {
      listingKey: updated.key,
      channel: listing.props.channel ?? "instagram",
      screenshot: PLACEHOLDER_PNG,
    },
    aboutNodeIds: [updated._id],
  });

  return updated;
}

export async function getListingWithSku(
  store: GraphStore,
  orgId: string,
  listingKey: string,
): Promise<{ listing: NodeRecord; sku: NodeRecord | null }> {
  const listing = await store.getNodeByKey(orgId, listingKey);
  if (!listing || listing.type !== "Listing") {
    throw new Error(`Listing not found: ${listingKey}`);
  }
  const hood = await store.neighborhood(orgId, listing._id, 1);
  const lists = hood.edges.find(
    (e) => e.type === "LISTS" && e.fromId === listing._id && e.validTo === null,
  );
  const sku =
    lists != null
      ? (hood.nodes.find((n) => n._id === lists.toId) ??
        (await store.getNode(orgId, lists.toId)))
      : null;
  return { listing, sku };
}
