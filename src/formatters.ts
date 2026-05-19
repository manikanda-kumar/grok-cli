import { formatCost } from "./cost.js";
import type { DecisionAnswer, PipelineResult, UsageSummary } from "./types.js";

export function formatMarkdown(result: PipelineResult): string {
  return `${withSources(result.content.trim(), result.sources)}\n\n${warnings(result.warnings)}${footer(result.usage)}`.trimEnd();
}

export function formatRaw(result: PipelineResult): string {
  return `${result.content.trim()}\n\n${footer(result.usage)}`.trimEnd();
}

export function formatJson(result: PipelineResult): string {
  return JSON.stringify(
    {
      mode: result.mode,
      web: result.web
        ? {
            search_enabled: result.web.searchEnabled,
            fetch_enabled: result.web.fetchEnabled,
          }
        : undefined,
      profile: result.profile,
      output_format: result.outputFormat,
      answer: formatAnswer(result.answer),
      content: result.content,
      sources: result.sources,
      warnings: result.warnings,
      usage: {
        total_prompt_tokens: result.usage.totalPromptTokens,
        total_completion_tokens: result.usage.totalCompletionTokens,
        cost_usd: result.usage.costUsd ?? null,
        server_tool_use: formatServerToolUse(result.usage.serverToolUse),
        calls: result.usage.calls.map((call) => ({
          role: call.role,
          model: call.model,
          prompt_tokens: call.promptTokens,
          completion_tokens: call.completionTokens,
          cost_usd: call.costUsd ?? null,
          server_tool_use: formatServerToolUse(call.serverToolUse),
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
  const toolParts: string[] = [];
  const webSearches = usage.serverToolUse?.webSearchRequests;
  const webFetches = usage.serverToolUse?.webFetchRequests;
  if (webSearches && webSearches > 0) toolParts.push(`Web searches: ${webSearches}`);
  if (webFetches && webFetches > 0) toolParts.push(`Web fetches: ${webFetches}`);
  const webPart = toolParts.length > 0 ? ` | ${toolParts.join(" | ")}` : "";
  return `---\nCost: ${formatCost(usage)} | Models: ${models} | Tokens: ${usage.totalPromptTokens.toLocaleString()} in / ${usage.totalCompletionTokens.toLocaleString()} out${webPart}`;
}

function formatServerToolUse(serverToolUse: UsageSummary["serverToolUse"]) {
  if (!serverToolUse) return undefined;
  const payload: Record<string, number> = {};
  if (serverToolUse.webSearchRequests !== undefined) payload.web_search_requests = serverToolUse.webSearchRequests;
  if (serverToolUse.webFetchRequests !== undefined) payload.web_fetch_requests = serverToolUse.webFetchRequests;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function warnings(items: string[]): string {
  if (items.length === 0) return "";
  return `## Warnings\n${items.map((item) => `- ${item}`).join("\n")}\n\n`;
}

function withSources(content: string, sources: PipelineResult["sources"]): string {
  if (sources.length === 0 || /(^|\n)## Sources\b/i.test(content)) return content;
  return `${content}\n\n## Sources\n${sources.map((source) => `- ${source.title ? `${source.title}: ` : ""}${source.url}`).join("\n")}`;
}

function formatAnswer(answer: DecisionAnswer | undefined) {
  if (!answer) return undefined;

  return {
    recommendation: answer.recommendation,
    key_facts: answer.keyFacts,
    tradeoffs: answer.tradeoffs,
    risks: answer.risks,
    open_questions: answer.openQuestions,
    confidence: answer.confidence,
  };
}
