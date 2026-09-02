import { buildGovernorPrompt } from "./prompts/governor.js";
import type { PromptContext } from "./prompts/base.js";

export function buildSystemPrompt(ctx: PromptContext): string {
  return buildGovernorPrompt(ctx);
}
