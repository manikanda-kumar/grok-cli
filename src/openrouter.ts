import { addUsageCall, emptyUsage } from "./cost.js";
import type {
  OpenRouterConfig,
  OpenRouterMessage,
  OpenRouterRequest,
  OpenRouterResponse,
  PipelineResult,
  Source,
} from "./types.js";

export interface OpenRouterCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  call: OpenRouterCall,
  fetchImpl: typeof fetch = fetch,
): Promise<PipelineResult> {
  if (!config.apiKey) {
    throw new OpenRouterError("Missing OPENROUTER_API_KEY. Set it in the environment or ~/.config/grok-cli/config.json.");
  }

  const body: OpenRouterRequest = {
    model: call.model,
    messages: call.messages,
  };
  if (call.temperature !== undefined) body.temperature = call.temperature;
  if (call.maxTokens !== undefined) body.max_tokens = call.maxTokens;
  if (call.json === true) body.response_format = { type: "json_object" };

  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.siteUrl ?? "https://github.com/local/grok-cli",
      "X-Title": config.appName,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(`OpenRouter request failed (${response.status}): ${text}`, response.status);
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterError("OpenRouter response did not include message content");
  }

  const usageCall = {
    role: call.role,
    model: json.model ?? call.model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
  };
  const usage = addUsageCall(
    emptyUsage(),
    json.usage?.cost === undefined ? usageCall : { ...usageCall, costUsd: json.usage.cost },
  );

  const sources: Source[] = (json.citations ?? []).map((url) => ({ url }));

  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "raw",
    content,
    sources,
    warnings: [],
    usage,
  };
}
