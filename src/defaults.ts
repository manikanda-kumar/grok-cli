import type { AppConfig, ModelProfiles, WebConfig } from "./types.js";

export const DEFAULT_MODELS: ModelProfiles = {
  quality: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.20",
    research: "perplexity/sonar-reasoning-pro",
    deepResearch: "perplexity/sonar-deep-research",
    nativeMulti: "x-ai/grok-4.20-multi-agent",
  },
  economy: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.3",
    research: "perplexity/sonar-pro",
    deepResearch: "perplexity/sonar-pro",
    nativeMulti: "x-ai/grok-4.3",
  },
};

export const DEFAULT_WEB_CONFIG: WebConfig = {
  search: {
    enabled: true,
    engine: "auto",
    maxResults: 5,
    maxTotalResults: 10,
  },
  fetch: {
    enabled: false,
    engine: "auto",
    maxContentTokens: 50000,
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  defaultMode: "auto",
  defaultProfile: "quality",
  models: DEFAULT_MODELS,
  openrouter: {
    appName: "grok-cli",
    siteUrl: "https://github.com/local/grok-cli",
  },
  web: DEFAULT_WEB_CONFIG,
};

export const DEFAULT_CONFIG_PATH = "~/.config/grok-cli/config.json";
