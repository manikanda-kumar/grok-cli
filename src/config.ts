import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { AppConfig, CliOptions, ModelAlias, Profile } from "./types.js";

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
  };
}
