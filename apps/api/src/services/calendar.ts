import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import { buildMeetingBrief, type MeetingBrief } from "@karya/agents";
import { ulid } from "ulid";
import { writeAuditEvent } from "./audit.js";

export type { MeetingBrief };

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

export async function listMeetings(
  store: GraphStore,
  orgId: string,
  range?: { from?: string; to?: string },
): Promise<NodeRecord[]> {
  const meetings = await store.listNodes(orgId, "Meeting");
  return meetings.filter((m) => {
    const startsAt = propString(m.props, "startsAt");
    if (!startsAt) return true;
    const t = Date.parse(startsAt);
    if (Number.isNaN(t)) return true;
    if (range?.from && t < Date.parse(range.from)) return false;
    if (range?.to && t > Date.parse(range.to)) return false;
    return true;
  });
}

export async function getMeetingBrief(
  store: GraphStore,
  orgId: string,
  meetingKey: string,
): Promise<MeetingBrief> {
  return buildMeetingBrief(store, orgId, meetingKey);
}

export async function createFollowUpTask(
  store: GraphStore,
  orgId: string,
  input: { meetingKey: string; note?: string; actor: string },
): Promise<{ task: NodeRecord }> {
  const meeting = await store.getNodeByKey(orgId, input.meetingKey);
  if (!meeting || meeting.type !== "Meeting") {
    throw new Error(`Meeting not found: ${input.meetingKey}`);
  }

  const hood = await store.neighborhood(orgId, meeting._id, 1);
  const about = hood.edges.find(
    (e) => e.type === "ABOUT" && e.fromId === meeting._id && e.validTo === null,
  );
  const po =
    about != null
      ? (hood.nodes.find((n) => n._id === about.toId) ?? null)
      : null;

  const taskKey = `Task:FollowUp-${ulid()}`;
  const task = await store.upsertNode({
    _id: newNodeId(),
    orgId,
    type: "Task",
    key: taskKey,
    label: input.note ?? `Follow-up: ${meeting.label}`,
    props: {
      status: "open",
      note: input.note ?? null,
      meetingKey: meeting.key,
      createdAt: new Date().toISOString(),
    },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "ABOUT",
    fromId: task._id,
    toId: meeting._id,
    props: {},
    validFrom: new Date(),
  });

  if (po) {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId,
      type: "FOLLOW_UP",
      fromId: task._id,
      toId: po._id,
      props: {},
      validFrom: new Date(),
    });
  }

  await writeAuditEvent(store, {
    orgId,
    eventType: "calendar.follow_up_created",
    actor: input.actor,
    sideEffectClass: "write",
    payload: {
      taskKey: task.key,
      meetingKey: meeting.key,
      poKey: po?.key ?? null,
    },
    aboutNodeIds: [task._id, meeting._id],
  });

  return { task };
}
