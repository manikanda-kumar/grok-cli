import { addUsageCall, emptyUsage } from "./cost.js";
import type {
  OpencodeGoConfig,
  OpencodeGoItem,
  OpencodeGoResponse,
  OpenRouterMessage,
  PipelineResult,
  Source,
} from "./types.js";

export interface OpencodeGoCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  // Responses-API structured output. Requires the caller to provide the full
  // JSON Schema (opencode-go passes it through to the upstream model).
  schema?: string;
}

export class OpencodeGoError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpencodeGoError";
  }
}

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";
// opencode.ai requires identifying User-Agent + session header to route/caching
// (plain python UA gets 403; missing x-opencode-session gets 400 MissingSessionID).
const SESSION_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Extract url_citation annotations into Source[], mirroring openrouter.extractSources. */
export function extractSources(resp: OpencodeGoResponse): Source[] {
  const byUrl = new Map<string, Source>();
  for (const url of resp.citations ?? []) {
    if (url) byUrl.set(url, { url });
  }
  for (const item of resp.output ?? []) {
    const parts = messageContent(item);
    for (const part of parts) {
      for (const annotation of part.annotations ?? []) {
        if (annotation?.url_citation?.url) {
          const url = annotation.url_citation.url;
          const title = annotation.url_citation.title;
          byUrl.set(url, title ? { url, title } : { url });
        }
      }
    }
  }
  return [...byUrl.values()];
}

// The Responses API can surface the message content either nested under
// item.message.content (some providers) or item.content (ours).
function messageContent(item: NonNullable<OpencodeGoResponse["output"]>[number]): Array<{
  type?: string;
  text?: string;
  annotations?: Array<{
    type?: string;
    start_index?: number;
    end_index?: number;
    url_citation?: { url?: string; title?: string };
  }>;
}> {
  if (item.type === "message") {
    return item.message?.content ?? item.content ?? [];
  }
  return item.content ?? [];
}

/** Normalize to the same PipelineResult shape the rest of the pipeline expects. */
export function handleSuccess(resp: OpencodeGoResponse, call: OpencodeGoCall): PipelineResult {
  const text = extractText(resp);
  if (!text) {
    throw new OpencodeGoError("opencode-go response did not include message content");
  }

  const model = resp.model ?? call.model;
  const usageCall = {
    role: call.role,
    model,
    promptTokens: resp.usage?.input_tokens ?? 0,
    completionTokens: resp.usage?.output_tokens ?? 0,
  };
  const usage = addUsageCall(emptyUsage(), usageCall);

  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "raw",
    content: text,
    sources: extractSources(resp),
    warnings: [],
    usage,
  };
}

export async function callOpencodeGo(
  config: OpencodeGoConfig,
  call: OpencodeGoCall,
  fetchImpl: typeof fetch = fetch,
): Promise<PipelineResult> {
  if (!config.apiKey) {
    throw new OpencodeGoError(
      "Missing OPENCODE_GO_API_KEY. Set it in the environment or ~/.config/grok-cli/config.json (config.opencodeGo.apiKey).",
    );
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || DEFAULT_BASE_URL;
  const sessionId = normalizeSessionId(config.sessionId);

  const items: OpencodeGoItem[] = call.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const body: Record<string, unknown> = {
    model: call.model,
    input: toInputArray(items),
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
    ...(call.maxTokens !== undefined ? { max_output_tokens: call.maxTokens } : {}),
  };
  if (call.json === true && call.schema === undefined) {
    // json_object structured output (Responses-API style).
    body.text = { format: { type: "json_object" } };
  }
  if (call.schema !== undefined) {
    body.text = { format: parseSchema(call.schema) };
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "grok-cli/0.1",
          ...(sessionId ? { "x-opencode-session": sessionId } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new OpencodeGoError(mapError(response.status, text, call.model), response.status);
        if (isRetryable(response.status) && attempt < 3) {
          await sleep(retryDelay(attempt, response));
          continue;
        }
        throw error;
      }

      let json: OpencodeGoResponse;
      try {
        json = (await response.json()) as OpencodeGoResponse;
      } catch (error) {
        throw new OpencodeGoError("opencode-go returned an invalid JSON response. Please retry.", undefined, {
          cause: error,
        });
      }
      return handleSuccess(json, call);
    } catch (error) {
      if (
        (error instanceof OpencodeGoError && error.status !== undefined && isRetryable(error.status)) ||
        (error instanceof TypeError && error.message.toLowerCase().includes("fetch"))
      ) {
        if (attempt < 3) {
          lastError = error;
          await sleep(retryDelay(attempt));
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError ?? new Error("opencode-go request failed after 3 attempts");
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, response?: Response): number {
  const backoff = Math.pow(2, attempt) * 1000;
  const header = response?.headers?.get?.("retry-after");
  if (header) {
    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(backoff, seconds * 1000);
  }
  return backoff;
}

/** ToInput: Responses-API supports both a plain string and an input array. We
 *  always send an array so roles survive. A lone system "prelude" becomes the
 *  Responses instructions field; remaining roles become user/assistant turns. */
function toInputArray(items: OpencodeGoItem[]): string | Array<{ role: string; content: string }> {
  const first = items[0];
  if (items.length === 1 && first?.role === "user") return first.content;
  return items.map((item) => ({ role: item.role, content: item.content }));
}

function extractText(resp: OpencodeGoResponse): string {
  // Prefer assistant message parts (most reliable on the Responses API).
  for (const item of resp.output ?? []) {
    const parts = messageContent(item);
    for (const part of parts) {
      if ((part.type === "output_text" || part.type === "text") && part.text?.trim()) return part.text;
    }
  }
  return "";
}

/** Standard error de-mangling into grok-cli friendly messages. */
function mapError(status: number, text: string, model: string): string {
  const detail = text.trim() || "No error details returned";
  const lower = detail.toLowerCase();

  if (status === 401 || status === 403) {
    return `opencode-go authentication failed: ${detail}`;
  }
  if (status === 402) {
    return `opencode-go credits or quota error: ${detail}`;
  }
  if (status === 400 && lower.includes("missing")) {
    return `opencode-go rejected the request: ${detail} (is the opencode-go API key valid? use --web-provider openrouter to fall back)`;
  }
  if (status === 400 || status === 404 || lower.includes("model") || lower.includes("unavailable")) {
    return `opencode-go model unavailable: ${model}. Try --economy, --web-provider openrouter, or another model alias.`;
  }
  if (status === 429 || status >= 500) {
    return `opencode-go provider error (${status}): ${detail}. Please retry.`;
  }
  return `opencode-go request failed (${status}): ${detail}`;
}

/** Parse --schema JSON string into the Responses json_schema format object. */
function parseSchema(source: string): Record<string, unknown> {
  try {
    const schema = JSON.parse(source) as Record<string, unknown>;
    return {
      type: "json_schema",
      name: "user_schema",
      strict: true,
      schema,
    };
  } catch {
    // --schema can also be a file path (the arg parser stores the raw value).
    throw new OpencodeGoError(`opencode-go --schema expects inline JSON (a file path is not supported for this provider).`);
  }
}

function normalizeSessionId(raw?: string): string | undefined {
  if (raw && SESSION_PATTERN.test(raw)) return raw;
  if (raw) {
    throw new OpencodeGoError(
      `Invalid x-opencode-session: ${raw}. Use 1-128 chars of [A-Za-z0-9._-].`,
    );
  }
  return undefined;
}
