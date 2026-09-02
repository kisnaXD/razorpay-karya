import { z } from "zod";
import { buildMeetingBrief } from "../calendar/meeting-brief.js";
import type { ToolContext } from "../types.js";
import { explanationField } from "./schemas.js";

export const calendarMeetingBriefSchema = z.object({
  meetingKey: z.string().min(1),
  explanation: explanationField,
});

export async function calendarMeetingBrief(
  ctx: ToolContext,
  input: z.infer<typeof calendarMeetingBriefSchema>,
) {
  const brief = await buildMeetingBrief(
    ctx.store,
    ctx.orgId,
    input.meetingKey,
  );
  await ctx.writeAudit({
    eventType: "calendar.brief_generated",
    sideEffectClass: "draft",
    payload: {
      meetingKey: brief.meetingKey,
      explanation: input.explanation,
      sectionCount: brief.sections.length,
    },
  });
  return brief;
}
