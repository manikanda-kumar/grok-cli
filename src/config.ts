import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type {
  AppConfig,
  CanonicalMode,
  CliOptions,
  CliWebOverrides,
  Mode,
  ModelAlias,
  Profile,
  ResolvedWebOptions,
  WebConfig,
} from "./types.js";

interface LoadConfigOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? join(homedir(), ".config", "grok-cli", "config.json");
  const fileConfig = readConfigFile(configPath);
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  const apiKey = env.OPENROUTER_API_KEY ?? merged.openrouter.apiKey;

  return {
    ...merged,
    openrouter: apiKey === undefined ? merged.openrouter : { ...merged.openrouter, apiKey },
  };
}

export function resolveModel(config: AppConfig, profile: Profile, alias: ModelAlias): string {
  return config.models[profile][alias];
}

export function resolveCliOptions(config: AppConfig, options: CliOptions): CliOptions {
  return {
    ...options,
    mode: options.modeExplicit ? options.mode : config.defaultMode,
    profile: options.profileExplicit ? options.profile : config.defaultProfile,
  };
}

export function canonicalizeMode(mode: Mode): { mode: CanonicalMode; warnings: string[] } {
  if (mode !== "research") return { mode, warnings: [] };
  return {
    mode: "deepresearch",
    warnings: ['Mode "research" is deprecated; use "deepresearch" instead.'],
  };
}

export function modeAllowsWeb(mode: CanonicalMode): boolean {
  return mode === "auto" || mode === "fast" || mode === "expert";
}

export function modelSupportsServerTools(model: string): boolean {
  return !model.startsWith("perplexity/");
}

export function resolveWebModel(config: AppConfig, profile: Profile, mode: CanonicalMode): string {
  const role = mode === "auto" ? "expert" : mode;
  const alias = role === "fast" ? "fast" : "expert";
  return resolveModel(config, profile, alias);
}

export function validateWebOptions(web: ResolvedWebOptions, cli: CliWebOverrides): void {
  if (web.allowedDomains?.length && web.blockedDomains?.length) {
    throw new Error(
      "Cannot combine --web-allowed-domains and --web-blocked-domains for web search. Use one list only.",
    );
  }
  if (cli.fetchFlag && !web.searchEnabled) {
    throw new Error('Flag "--web-fetch" has no effect without web search. Drop --no-web or enable web.search in config.');
  }
}

export function assertWebToolsCompatible(
  config: AppConfig,
  profile: Profile,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
): void {
  if (!web.searchEnabled && !web.fetchEnabled) return;
  if (!modeAllowsWeb(mode)) return;

  const model = resolveWebModel(config, profile, mode);
  if (!modelSupportsServerTools(model)) {
    throw new Error(
      `Model ${model} does not support OpenRouter server tools. Use a Grok model alias or run with --no-web.`,
    );
  }
}

export function resolveWebOptions(config: AppConfig, mode: CanonicalMode, web: CliWebOverrides): ResolvedWebOptions {
  const searchEnabled = modeAllowsWeb(mode) && config.web.search.enabled && !web.noWeb;
  const fetchEnabled = searchEnabled && (config.web.fetch.enabled || web.fetchFlag);
  const allowedDomains = web.allowedDomains ?? config.web.search.allowedDomains;
  const blockedDomains = web.blockedDomains ?? config.web.search.blockedDomains;

  return {
    searchEnabled,
    fetchEnabled,
    engine: web.engine ?? config.web.search.engine,
    maxResults: web.maxResults ?? config.web.search.maxResults,
    maxTotalResults: web.maxTotalResults ?? config.web.search.maxTotalResults,
    fetchEngine: web.fetchEngine ?? config.web.fetch.engine,
    maxContentTokens: web.maxContentTokens ?? config.web.fetch.maxContentTokens,
    ...(allowedDomains ? { allowedDomains } : {}),
    ...(blockedDomains ? { blockedDomains } : {}),
  };
}

function readConfigFile(path: string): Partial<AppConfig> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Partial<AppConfig>;
}

function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    defaultMode: override.defaultMode ?? base.defaultMode,
    defaultProfile: override.defaultProfile ?? base.defaultProfile,
    models: {
      quality: { ...base.models.quality, ...override.models?.quality },
      economy: { ...base.models.economy, ...override.models?.economy },
    },
    openrouter: { ...base.openrouter, ...override.openrouter },
    web: mergeWebConfig(base.web, override.web),
  };
}

function mergeWebConfig(base: WebConfig, override?: Partial<WebConfig>): WebConfig {
  return {
    search: { ...base.search, ...override?.search },
    fetch: { ...base.fetch, ...override?.fetch },
  };
}
