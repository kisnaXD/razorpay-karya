import type { ToolContext } from "../types.js";

export async function memorySearch(
  ctx: ToolContext,
  input: {
    tags?: string[];
    subject?: string;
    explanation: string;
  },
) {
  if (!ctx.searchMemories) {
    throw new Error("memory_search_not_configured");
  }
  const memories = await ctx.searchMemories({
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
  });
  return {
    memories: memories.map((m) => ({
      id: m._id,
      kind: m.kind,
      subject: m.subject,
      content: m.content,
      tags: m.tags,
      useCount: m.useCount,
    })),
  };
}

export async function memoryRecord(
  ctx: ToolContext,
  input: {
    kind: "preference" | "decision";
    subject: string;
    content: string;
    tags: string[];
    explanation: string;
  },
) {
  if (!ctx.recordMemory) {
    throw new Error("memory_record_not_configured");
  }
  const memory = await ctx.recordMemory({
    kind: input.kind,
    subject: input.subject,
    content: input.content,
    tags: input.tags,
  });
  return {
    memory: {
      id: memory._id,
      kind: memory.kind,
      subject: memory.subject,
      content: memory.content,
      tags: memory.tags,
    },
  };
}
