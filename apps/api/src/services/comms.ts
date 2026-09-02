import type { Db } from "mongodb";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import {
  draftVendorChaseEmail,
  type EmailTone,
} from "@karya/agents";
import { ulid } from "ulid";
import { createApproval, type CreateApprovalResult } from "./approvals.js";
import { writeAuditEvent } from "./audit.js";

export type DraftEmailResult = {
  messageKey: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export async function draftEmail(
  store: GraphStore,
  orgId: string,
  input: {
    aboutNodeKey: string;
    recipientOrgKey: string;
    tone?: EmailTone;
    actor: string;
  },
): Promise<DraftEmailResult> {
  const about = await store.getNodeByKey(orgId, input.aboutNodeKey);
  if (!about) throw new Error(`Node not found: ${input.aboutNodeKey}`);

  const draft = await draftVendorChaseEmail(store, orgId, {
    aboutNodeKey: input.aboutNodeKey,
    recipientOrgKey: input.recipientOrgKey,
    ...(input.tone !== undefined ? { tone: input.tone } : {}),
  });

  const messageKey = `Message:Draft-${ulid()}`;
  const message = await store.upsertNode({
    _id: newNodeId(),
    orgId,
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

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "ABOUT",
    fromId: message._id,
    toId: about._id,
    props: {},
    validFrom: new Date(),
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "comms.email_drafted",
    actor: input.actor,
    sideEffectClass: "draft",
    payload: {
      messageKey: message.key,
      aboutNodeKey: input.aboutNodeKey,
      recipientOrgKey: input.recipientOrgKey,
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

export async function requestSendEmail(
  db: Db,
  store: GraphStore,
  orgId: string,
  input: { messageKey: string; explanation: string; actor: string },
): Promise<CreateApprovalResult> {
  return createApproval(db, store, orgId, {
    action: "email.send",
    orgId,
    targetNodeKey: input.messageKey,
    explanation: input.explanation,
    proposedBy: input.actor,
  });
}

async function maybeSendViaResend(input: {
  apiKey: string | undefined;
  from: string | undefined;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}): Promise<{ sentViaResend: boolean }> {
  if (!input.apiKey || !input.from) {
    return { sentViaResend: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.bodyText,
        html: input.bodyHtml,
      }),
    });
    return { sentViaResend: res.ok };
  } catch {
    return { sentViaResend: false };
  }
}

export async function executeSendEmail(
  store: GraphStore,
  orgId: string,
  messageKey: string,
  actor: string,
  resend?: { apiKey?: string; from?: string },
): Promise<NodeRecord> {
  const message = await store.getNodeByKey(orgId, messageKey);
  if (!message || message.type !== "Message") {
    throw new Error(`Message not found: ${messageKey}`);
  }

  const to =
    typeof message.props.to === "string"
      ? message.props.to
      : "procurement@meenakshibrass.example.com";
  const subject =
    typeof message.props.subject === "string"
      ? message.props.subject
      : message.label;
  const bodyText =
    typeof message.props.body_text === "string" ? message.props.body_text : "";
  const bodyHtml =
    typeof message.props.body_html === "string"
      ? message.props.body_html
      : bodyText;

  const { sentViaResend } = await maybeSendViaResend({
    apiKey: resend?.apiKey,
    from: resend?.from,
    to,
    subject,
    bodyText,
    bodyHtml,
  });

  const sentAt = new Date().toISOString();
  const updated = await store.upsertNode({
    _id: message._id,
    orgId: message.orgId,
    type: message.type,
    key: message.key,
    label: message.label,
    props: {
      ...message.props,
      status: "sent",
      sentAt,
      sent_via_resend: sentViaResend,
    },
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "message.sent",
    actor,
    sideEffectClass: "external",
    payload: {
      messageKey: updated.key,
      to,
      subject,
      sentViaResend,
    },
    aboutNodeIds: [updated._id],
  });

  return updated;
}
