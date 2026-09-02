import { z } from "zod";
import { draftListingForSku } from "../listings/draft-listing.js";
import type { ToolContext } from "../types.js";
import { explanationField } from "./schemas.js";

export const listingsDraftCopySchema = z.object({
  skuKey: z.string().min(1),
  channel: z.enum(["instagram", "catalog"]),
  explanation: explanationField,
});

export async function listingsDraftCopy(
  ctx: ToolContext,
  input: z.infer<typeof listingsDraftCopySchema>,
) {
  const sku = await ctx.store.getNodeByKey(ctx.orgId, input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${input.skuKey}`);
  }

  const hood = await ctx.store.neighborhood(ctx.orgId, sku._id, 1);
  let listing = null;
  for (const edge of hood.edges) {
    if (edge.type !== "LISTS" || edge.toId !== sku._id || edge.validTo !== null) {
      continue;
    }
    const node =
      hood.nodes.find((n) => n._id === edge.fromId) ??
      (await ctx.store.getNode(ctx.orgId, edge.fromId));
    if (node?.type === "Listing" && node.props.channel === input.channel) {
      listing = node;
      break;
    }
  }
  if (!listing) {
    throw new Error(
      `Listing not found for ${input.skuKey} channel ${input.channel}`,
    );
  }

  const draft = await draftListingForSku(ctx.store, ctx.orgId, input.skuKey);
  await ctx.store.upsertNode({
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

  await ctx.writeAudit({
    eventType: "listing.drafted",
    sideEffectClass: "draft",
    payload: {
      listingKey: listing.key,
      skuKey: input.skuKey,
      channel: input.channel,
      explanation: input.explanation,
    },
    aboutNodeIds: [listing._id],
  });

  return {
    listingKey: listing.key,
    title: draft.title,
    bullets: draft.bullets,
    hashtags: draft.hashtags,
  };
}
