import { formatCost } from "./cost.js";
import type { PipelineResult, UsageSummary } from "./types.js";

export function formatMarkdown(result: PipelineResult): string {
  return `${result.content.trim()}\n\n${warnings(result.warnings)}${footer(result.usage)}`.trimEnd();
}

export function formatRaw(result: PipelineResult): string {
  return `${result.content.trim()}\n\n${footer(result.usage)}`.trimEnd();
}

export function formatJson(result: PipelineResult): string {
  return JSON.stringify(
    {
      mode: result.mode,
      profile: result.profile,
      output_format: result.outputFormat,
      answer: result.answer,
      content: result.content,
      sources: result.sources,
      warnings: result.warnings,
      usage: {
        total_prompt_tokens: result.usage.totalPromptTokens,
        total_completion_tokens: result.usage.totalCompletionTokens,
        cost_usd: result.usage.costUsd,
        calls: result.usage.calls.map((call) => ({
          role: call.role,
          model: call.model,
          prompt_tokens: call.promptTokens,
          completion_tokens: call.completionTokens,
          cost_usd: call.costUsd,
        })),
      },
    },
    null,
    2,
  );
}

export function formatError(error: unknown, json: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (json) return JSON.stringify({ error: { message } }, null, 2);
  return `Error: ${message}`;
}

function footer(usage: UsageSummary): string {
  const models = [...new Set(usage.calls.map((call) => call.model))].join(", ") || "unavailable";
  return `---\nCost: ${formatCost(usage)} | Models: ${models} | Tokens: ${usage.totalPromptTokens.toLocaleString()} in / ${usage.totalCompletionTokens.toLocaleString()} out`;
}

function warnings(items: string[]): string {
  if (items.length === 0) return "";
  return `## Warnings\n${items.map((item) => `- ${item}`).join("\n")}\n\n`;
}
