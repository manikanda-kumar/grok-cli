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
    options?: ErrorOptions,
  ) {
    super(message, options);
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
  if (call.json === true && supportsJsonObjectResponseFormat(call.model)) body.response_format = { type: "json_object" };

  let response: Response;
  try {
    response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.siteUrl ?? "https://github.com/local/grok-cli",
        "X-Title": config.appName,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new OpenRouterError("Network error talking to OpenRouter. Please retry.", undefined, { cause: error });
  }

  if (!response.ok) {
    const text = await response.text();
    throw mapOpenRouterError(response.status, text, call.model);
  }

  let json: OpenRouterResponse;
  try {
    json = (await response.json()) as OpenRouterResponse;
  } catch (error) {
    throw new OpenRouterError("OpenRouter returned an invalid JSON response. Please retry.", undefined, { cause: error });
  }
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

function mapOpenRouterError(status: number, text: string, model: string): OpenRouterError {
  const detail = text.trim() || "No error details returned";
  const lower = detail.toLowerCase();

  if (status === 401 || status === 403) {
    return new OpenRouterError(`OpenRouter authentication failed: ${detail}`, status);
  }

  if (status === 402) {
    return new OpenRouterError(`OpenRouter credits or quota error: ${detail}`, status);
  }

  if (status === 404 || lower.includes("model") || lower.includes("endpoint")) {
    return new OpenRouterError(`Model unavailable: ${model}. Try --economy or override the configured model alias.`, status);
  }

  if (status === 429 || status >= 500) {
    return new OpenRouterError(`OpenRouter provider error (${status}): ${detail}. Please retry.`, status);
  }

  return new OpenRouterError(`OpenRouter request failed (${status}): ${detail}`, status);
}

function supportsJsonObjectResponseFormat(model: string): boolean {
  return !model.startsWith("perplexity/");
}
