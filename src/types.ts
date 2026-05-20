export type Mode = "auto" | "fast" | "expert" | "deepresearch" | "research" | "multi";

export type CanonicalMode = Exclude<Mode, "research">;

export type Profile = "quality" | "economy";

export type OutputFormat = "brief" | "report" | "raw";

export type ModelAlias = "fast" | "expert" | "research" | "deepResearch" | "nativeMulti";

export type ModelAliases = Record<ModelAlias, string>;

export type ModelProfiles = Record<Profile, ModelAliases>;

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

export interface CliOptions {
  prompt: string;
  mode: Mode;
  modeExplicit: boolean;
  profile: Profile;
  profileExplicit: boolean;
  outputFormat: OutputFormat;
  json: boolean;
  web: CliWebOverrides;
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
