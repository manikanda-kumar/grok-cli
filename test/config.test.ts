import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { loadConfig, resolveCliOptions, resolveModel } from "../src/config.js";

describe("defaults", () => {
  it("uses quality-first Grok and Sonar defaults", () => {
    expect(DEFAULT_CONFIG.defaultProfile).toBe("quality");
    expect(DEFAULT_CONFIG.models.quality.fast).toBe("x-ai/grok-4.3");
    expect(DEFAULT_CONFIG.models.quality.expert).toBe("x-ai/grok-4.20");
    expect(DEFAULT_CONFIG.models.quality.research).toBe("perplexity/sonar-pro-search");
  });
});

describe("loadConfig", () => {
  it("loads defaults and env API key", () => {
    const config = loadConfig({ env: { OPENROUTER_API_KEY: "test-openrouter-key" } });
    expect(config.openrouter.apiKey).toBe("test-openrouter-key");
    expect(config.defaultProfile).toBe("quality");
  });

  it("merges config file model overrides", () => {
    const dir = mkdtempSync(join(tmpdir(), "grok-cli-"));
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ models: { economy: { research: "perplexity/sonar" } } }));

    const config = loadConfig({ configPath, env: {} });
    expect(config.models.economy.research).toBe("perplexity/sonar");
    expect(config.models.quality.expert).toBe("x-ai/grok-4.20");
  });
});

describe("resolveModel", () => {
  it("uses profile alias", () => {
    expect(resolveModel(DEFAULT_CONFIG, "quality", "expert")).toBe("x-ai/grok-4.20");
    expect(resolveModel(DEFAULT_CONFIG, "economy", "research")).toBe("perplexity/sonar");
  });
});

describe("resolveCliOptions", () => {
  const config = { ...DEFAULT_CONFIG, defaultMode: "research" as const, defaultProfile: "economy" as const };

  it("applies config default mode and profile when CLI did not override them", () => {
    expect(
      resolveCliOptions(config, {
        prompt: "Prompt",
        mode: "auto",
        modeExplicit: false,
        profile: "quality",
        profileExplicit: false,
        outputFormat: "brief",
        json: false,
      }),
    ).toMatchObject({ mode: "research", profile: "economy" });
  });

  it("keeps explicit CLI mode and profile over config defaults", () => {
    expect(
      resolveCliOptions(config, {
        prompt: "Prompt",
        mode: "expert",
        modeExplicit: true,
        profile: "quality",
        profileExplicit: true,
        outputFormat: "brief",
        json: false,
      }),
    ).toMatchObject({ mode: "expert", profile: "quality" });
  });
});
