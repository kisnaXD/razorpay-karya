import { z } from "zod";
import { newEdgeId, newNodeId } from "@karya/graph";
import { ulid } from "ulid";
import {
  draftVendorChaseEmail,
  type EmailTone,
} from "../comms/draft-email.js";
import type { ToolContext } from "../types.js";
import { explanationField } from "./schemas.js";

export const commsDraftEmailSchema = z.object({
  aboutNodeKey: z.string().min(1),
  recipientOrgKey: z.string().min(1),
  tone: z.enum(["firm", "friendly"]).optional(),
  explanation: explanationField,
});

export async function commsDraftEmail(
  ctx: ToolContext,
  input: z.infer<typeof commsDraftEmailSchema>,
) {
  const about = await ctx.store.getNodeByKey(ctx.orgId, input.aboutNodeKey);
  if (!about) throw new Error(`Node not found: ${input.aboutNodeKey}`);

  const draft = await draftVendorChaseEmail(ctx.store, ctx.orgId, {
    aboutNodeKey: input.aboutNodeKey,
    recipientOrgKey: input.recipientOrgKey,
    ...(input.tone !== undefined ? { tone: input.tone as EmailTone } : {}),
  });

  const messageKey = `Message:Draft-${ulid()}`;
  const message = await ctx.store.upsertNode({
    _id: newNodeId(),
    orgId: ctx.orgId,
    type: "Message",
    key: messageKey,
    label: draft.subject,
    props: {
      channel: "email",
      direction: "out",
      status: "draft",
      subject: draft.subject,
      to: "procurement@meenakshibrass.example.com",
      body_text: draft.bodyText,
      body_html: draft.bodyHtml,
      recipient_org_key: input.recipientOrgKey,
    },
  });

  await ctx.store.writeEdge({
    _id: newEdgeId(),
    orgId: ctx.orgId,
    type: "ABOUT",
    fromId: message._id,
    toId: about._id,
    props: {},
    validFrom: new Date(),
  });

  await ctx.writeAudit({
    eventType: "comms.email_drafted",
    sideEffectClass: "draft",
    payload: {
      messageKey: message.key,
      aboutNodeKey: input.aboutNodeKey,
      recipientOrgKey: input.recipientOrgKey,
      explanation: input.explanation,
    },
    aboutNodeIds: [message._id, about._id],
  });

  return {
    messageKey: message.key,
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml,
  };
}
