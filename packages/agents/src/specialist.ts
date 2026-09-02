import { streamText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { GovernorDeps, GovernorTurnResult } from "./governor.js";
import { buildPromptForAgent } from "./prompts/index.js";
import { newEntryId, wrapToolsForTracing } from "./tracing.js";
import type { AgentId, AgentThread, ThreadEntry } from "./types.js";

export type SpecialistDeps = GovernorDeps & { agentId: AgentId };

function toCoreMessages(entries: ThreadEntry[]): CoreMessage[] {
  const messages: CoreMessage[] = [];
  for (const entry of entries) {
    if (entry.kind === "user") {
      messages.push({ role: "user", content: entry.content });
    } else if (entry.kind === "assistant" && entry.content.trim().length > 0) {
      messages.push({ role: "assistant", content: entry.content });
    }
  }
  return messages;
}

export async function runSpecialistTurn(
  deps: SpecialistDeps,
  userMessage: string,
): Promise<GovernorTurnResult> {
  if (deps.agentId === "governor") {
    throw new Error("runSpecialistTurn requires a specialist agentId");
  }

  const newEntries: ThreadEntry[] = [];
  const now = () => new Date().toISOString();

  const userEntry: ThreadEntry = {
    id: newEntryId(),
    kind: "user",
    content: userMessage,
    contextNodeKey: deps.contextNodeKey,
    createdAt: now(),
  };
  newEntries.push(userEntry);
  await deps.onUserEntry?.(userEntry);

  const state = {
    newEntries,
    pendingApproval: null as AgentThread["pending"],
    onToolStart: deps.onToolStart,
    onToolFinish: deps.onToolFinish,
    agentId: deps.agentId,
  };

  const openai = createOpenAI({ apiKey: deps.apiKey });
  const system = buildPromptForAgent(deps.agentId, {
    orgLabel: deps.orgLabel,
    contextNodeKey: deps.contextNodeKey,
    exceptionCount: deps.exceptionCount,
    ...(deps.memories !== undefined ? { memories: deps.memories } : {}),
    ...(deps.briefingSummary !== undefined
      ? { briefingSummary: deps.briefingSummary }
      : {}),
  });

  const messages: CoreMessage[] = [
    ...toCoreMessages(deps.threadEntries),
    { role: "user", content: userMessage },
  ];

  const tracedTools = wrapToolsForTracing(deps.tools, state);

  const result = streamText({
    model: openai(deps.model),
    system,
    messages,
    tools: tracedTools,
    maxSteps: 12,
  });

  let assistantText = "";
  for await (const delta of result.textStream) {
    assistantText += delta;
    deps.onTextDelta?.(delta);
  }

  if (!assistantText.trim()) {
    assistantText = (await result.text) || "";
  }

  const assistantEntry: ThreadEntry = {
    id: newEntryId(),
    kind: "assistant",
    content: assistantText,
    createdAt: now(),
    agentId: deps.agentId,
  };
  newEntries.push(assistantEntry);

  return {
    assistantText,
    newEntries,
    pendingApproval: state.pendingApproval,
  };
}
