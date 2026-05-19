import type { AppConfig, ModelProfiles } from "./types.js";

export const DEFAULT_MODELS: ModelProfiles = {
  quality: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.20",
    research: "perplexity/sonar-pro-search",
    deepResearch: "perplexity/sonar-deep-research",
    nativeMulti: "x-ai/grok-4.20-multi-agent",
  },
  economy: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.3",
    research: "perplexity/sonar",
    deepResearch: "perplexity/sonar",
    nativeMulti: "x-ai/grok-4.3",
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
};

export const DEFAULT_CONFIG_PATH = "~/.config/grok-cli/config.json";
