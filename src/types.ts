export type Mode = "auto" | "fast" | "expert" | "research" | "multi";

export type Profile = "quality" | "economy";

export type OutputFormat = "brief" | "report" | "raw";

export type ModelAlias = "fast" | "expert" | "research" | "deepResearch" | "nativeMulti";

export type ModelAliases = Record<ModelAlias, string>;

export interface ModelProfiles {
  quality: ModelAliases;
  economy: ModelAliases;
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
}

export interface CliOptions {
  prompt: string;
  mode: Mode;
  modeExplicit: boolean;
  profile: Profile;
  profileExplicit: boolean;
  outputFormat: OutputFormat;
  json: boolean;
}

export interface UsageCall {
  role: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  costUsd?: number;
  calls: UsageCall[];
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

export interface PipelineResult {
  mode: Mode;
  profile: Profile;
  outputFormat: OutputFormat;
  content: string;
  answer?: DecisionAnswer;
  sources: Source[];
  warnings: string[];
  usage: UsageSummary;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

export interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenRouterUsage;
  citations?: string[];
}
