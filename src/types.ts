export type Mode = "auto" | "fast" | "expert" | "deepresearch" | "research" | "multi" | "retrieve";

export type CanonicalMode = Exclude<Mode, "research">;

export type Profile = "quality" | "economy";

export type OutputFormat = "brief" | "report" | "raw";

// --output controls the high-level shape of what's emitted: a synthesized brief
// (default), raw retrieval results (Tavily-style), or both side-by-side.
export type OutputStyle = "brief" | "results" | "both";

export type ModelAlias = "fast" | "expert" | "research" | "deepResearch" | "nativeMulti";

export type ModelAliases = Record<ModelAlias, string>;

export type ModelProfiles = Record<Profile, ModelAliases>;

// Web retrieval provider. Only "openrouter" is supported today; kept as an
// extension point so future providers can be wired behind --web-provider.
export type WebProvider = "openrouter";

export interface WebSearchConfig {
  enabled: boolean;
  engine: string;
  maxResults: number;
  maxTotalResults: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

export interface WebFetchConfig {
  enabled: boolean;
  engine: string;
  maxContentTokens: number;
}

export interface WebConfig {
  search: WebSearchConfig;
  fetch: WebFetchConfig;
}

export interface OpenRouterConfig {
  apiKey?: string;
  appName: string;
  siteUrl?: string;
}

export interface AppConfig {
  defaultMode: Mode;
  defaultProfile: Profile;
  models: ModelProfiles;
  openrouter: OpenRouterConfig;
  web: WebConfig;
}

export interface CliWebOverrides {
  noWeb: boolean;
  deprecatedWebFlag: boolean;
  fetchFlag: boolean;
  engine?: string;
  maxResults?: number;
  maxTotalResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  fetchEngine?: string;
  maxContentTokens?: number;
}

export interface ResolvedWebOptions {
  searchEnabled: boolean;
  fetchEnabled: boolean;
  engine: string;
  maxResults: number;
  maxTotalResults: number;
  fetchEngine: string;
  maxContentTokens: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

/** Network filter for /whathappened when --x is used. */
export type XNetworkMode = "off" | "prefer" | "strict";

export interface CliXOptions {
  /** Shell out to Grok agent /whathappened for native X signal. */
  enabled: boolean;
  /** Skip OpenRouter web research; return X signal only. */
  only: boolean;
  network: XNetworkMode;
  timeoutMs?: number;
  maxTurns?: number;
}

export interface XSignalOptions {
  topic: string;
  network?: XNetworkMode;
  timeoutMs?: number;
  maxTurns?: number;
  grokBin?: string;
  /** Suppress progress on stderr. */
  jsonQuiet?: boolean;
}

export interface XSignalResult {
  markdown: string;
  rawText: string;
  reportPath?: string;
  sessionId?: string;
  costUsd?: number;
  warnings: string[];
}

export interface CliOptions {
  prompt: string;
  mode: Mode;
  modeExplicit: boolean;
  profile: Profile;
  profileExplicit: boolean;
  outputFormat: OutputFormat;
  outputStyle: OutputStyle;
  retrieve: boolean;
  schema?: string;
  webProvider: WebProvider;
  json: boolean;
  web: CliWebOverrides;
  x: CliXOptions;
  maxCost?: number;
}

export interface ServerToolUse {
  webSearchRequests?: number;
  webFetchRequests?: number;
}

export interface UsageCall {
  role: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
  serverToolUse?: ServerToolUse;
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  costUsd?: number;
  calls: UsageCall[];
  serverToolUse?: ServerToolUse;
}

export interface Source {
  title?: string;
  url: string;
}

// A single web retrieval result in Tavily-like shape. `score` and `raw_content`
// are populated only when the underlying provider surfaces them; OpenRouter web
// tools currently expose title/url/snippet via annotations, so score is derived
// heuristically and raw_content is omitted.
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string;
  favicon?: string;
}

// Result of a retrieve-mode run. `results` is the primary payload; `answer` is
// an optional LLM-generated summary (only when --output brief or both).
export interface RetrieveResult {
  query: string;
  results: SearchResult[];
  answer?: string;
  sources: Source[];
  usage?: UsageSummary;
}

export interface DecisionAnswer {
  recommendation: string;
  keyFacts: string[];
  tradeoffs: string[];
  risks: string[];
  openQuestions: string[];
  confidence: "low" | "medium" | "high";
}

export interface PipelineWebInfo {
  searchEnabled: boolean;
  fetchEnabled: boolean;
}

export interface PipelineResult {
  mode: CanonicalMode;
  profile: Profile;
  outputFormat: OutputFormat;
  content: string;
  answer?: DecisionAnswer;
  sources: Source[];
  warnings: string[];
  usage: UsageSummary;
  web?: PipelineWebInfo;
  // Populated by retrieve mode and by --output both / --retrieve on any mode.
  // Mirrors Tavily's results[] array.
  searchResults?: SearchResult[];
  // Populated when --schema is used: the parsed JSON object the model returned
  // constrained by the user-supplied schema.
  schemaResult?: unknown;
  // Populated when --x runs /whathappened via the Grok agent.
  xSignal?: XSignalResult;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
  annotations?: UrlCitationAnnotation[];
}

export interface UrlCitation {
  url: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

export interface UrlCitationAnnotation {
  type: "url_citation";
  url_citation: UrlCitation;
}

export interface WebSearchToolParameters {
  engine?: string;
  max_results?: number;
  max_total_results?: number;
  allowed_domains?: string[];
  excluded_domains?: string[];
}

export interface WebFetchToolParameters {
  engine?: string;
  max_content_tokens?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export type OpenRouterWebSearchTool = {
  type: "openrouter:web_search";
  parameters?: WebSearchToolParameters;
};

export type OpenRouterWebFetchTool = {
  type: "openrouter:web_fetch";
  parameters?: WebFetchToolParameters;
};

export type OpenRouterTool = OpenRouterWebSearchTool | OpenRouterWebFetchTool;

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  tools?: OpenRouterTool[];
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

export interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string; annotations?: UrlCitationAnnotation[] } }>;
  usage?: OpenRouterUsage;
  citations?: string[];
}
