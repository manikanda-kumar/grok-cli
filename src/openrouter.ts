import { addUsageCall, emptyUsage } from "./cost.js";
import type {
  OpenRouterConfig,
  OpenRouterMessage,
  OpenRouterRequest,
  OpenRouterResponse,
  OpenRouterTool,
  OpenRouterWebFetchTool,
  OpenRouterWebSearchTool,
  PipelineResult,
  ResolvedWebOptions,
  ServerToolUse,
  Source,
  UrlCitationAnnotation,
} from "./types.js";

export interface OpenRouterCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  web?: ResolvedWebOptions;
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

export function buildTools(model: string, web?: ResolvedWebOptions): OpenRouterTool[] | undefined {
  if (!web || (!web.searchEnabled && !web.fetchEnabled) || model.startsWith("perplexity/")) {
    return undefined;
  }

  const tools: OpenRouterTool[] = [];

  if (web.searchEnabled) {
    const parameters = {
      ...(web.engine !== "auto" ? { engine: web.engine } : {}),
      max_results: web.maxResults,
      max_total_results: web.maxTotalResults,
      ...(web.allowedDomains ? { allowed_domains: web.allowedDomains } : {}),
      ...(web.blockedDomains ? { excluded_domains: web.blockedDomains } : {}),
    };
    tools.push({ type: "openrouter:web_search", parameters });
  }

  if (web.fetchEnabled) {
    const fetchParameters = {
      ...(web.fetchEngine !== "auto" ? { engine: web.fetchEngine } : {}),
      max_content_tokens: web.maxContentTokens,
      ...(web.allowedDomains ? { allowed_domains: web.allowedDomains } : {}),
      ...(web.blockedDomains ? { blocked_domains: web.blockedDomains } : {}),
    };
    tools.push({ type: "openrouter:web_fetch", parameters: fetchParameters } satisfies OpenRouterWebFetchTool);
  }

  return tools.length > 0 ? tools : undefined;
}

export function extractSources(json: OpenRouterResponse): Source[] {
  const byUrl = new Map<string, Source>();

  for (const url of json.citations ?? []) {
    if (url) byUrl.set(url, { url });
  }

  const annotations = json.choices?.[0]?.message?.annotations ?? [];
  for (const annotation of annotations) {
    const source = annotationToSource(annotation);
    if (source) byUrl.set(source.url, mergeSource(byUrl.get(source.url), source));
  }

  return [...byUrl.values()];
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  call: OpenRouterCall,
  fetchImpl: typeof fetch = fetch,
): Promise<PipelineResult> {
  if (!config.apiKey) {
    throw new OpenRouterError("Missing OPENROUTER_API_KEY. Set it in the environment or ~/.config/grok-cli/config.json.");
  }

  const tools = buildTools(call.model, call.web);
  const body: OpenRouterRequest = {
    model: call.model,
    messages: call.messages,
  };
  if (call.temperature !== undefined) body.temperature = call.temperature;
  if (call.maxTokens !== undefined) body.max_tokens = call.maxTokens;
  if (call.json === true && supportsJsonObjectResponseFormat(call.model)) body.response_format = { type: "json_object" };
  if (tools) body.tools = tools;

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
    throw mapOpenRouterError(response.status, text, call.model, tools !== undefined);
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

  const serverToolUse = mapServerToolUse(json.usage?.server_tool_use);
  const usageCall = {
    role: call.role,
    model: json.model ?? call.model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    ...(serverToolUse ? { serverToolUse } : {}),
    ...(json.usage?.cost === undefined ? {} : { costUsd: json.usage.cost }),
  };
  const usage = addUsageCall(emptyUsage(), usageCall);

  const sources = extractSources(json);

  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "raw",
    content,
    sources,
    warnings: [],
    usage,
    ...(call.web
      ? {
          web: {
            searchEnabled: call.web.searchEnabled,
            fetchEnabled: call.web.fetchEnabled,
          },
        }
      : {}),
  };
}

function annotationToSource(annotation: UrlCitationAnnotation): Source | undefined {
  if (annotation.type !== "url_citation") return undefined;
  const citation = annotation.url_citation;
  if (!citation?.url) return undefined;
  return citation.title ? { url: citation.url, title: citation.title } : { url: citation.url };
}

function mergeSource(existing: Source | undefined, next: Source): Source {
  if (!existing) return next;
  if (existing.title || !next.title) return { url: next.url, ...(existing.title ? { title: existing.title } : {}) };
  return { url: next.url, title: next.title };
}

function mapServerToolUse(raw?: NonNullable<OpenRouterResponse["usage"]>["server_tool_use"]): ServerToolUse | undefined {
  if (!raw) return undefined;
  const webSearchRequests = raw.web_search_requests;
  const webFetchRequests = raw.web_fetch_requests;
  const mapped: ServerToolUse = {
    ...(webSearchRequests !== undefined && webSearchRequests > 0 ? { webSearchRequests } : {}),
    ...(webFetchRequests !== undefined && webFetchRequests > 0 ? { webFetchRequests } : {}),
  };
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapOpenRouterError(status: number, text: string, model: string, toolsRequested: boolean): OpenRouterError {
  const detail = text.trim() || "No error details returned";
  const lower = detail.toLowerCase();

  if (status === 401 || status === 403) {
    return new OpenRouterError(`OpenRouter authentication failed: ${detail}`, status);
  }

  if (status === 402) {
    return new OpenRouterError(`OpenRouter credits or quota error: ${detail}`, status);
  }

  if (toolsRequested && (status === 404 || lower.includes("tool use"))) {
    return new OpenRouterError(
      `Model does not support OpenRouter server tools: ${model}. Use a Grok 4.x model, or run with --no-web.`,
      status,
    );
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
