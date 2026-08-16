import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import {
  assertWebToolsCompatible,
  loadConfig,
  modeAllowsWeb,
  resolveCliOptions,
  resolveModel,
  resolveWebOptions,
  validateWebOptions,
} from "../src/config.js";

describe("defaults", () => {
  it("uses quality-first Grok and Sonar defaults", () => {
    expect(DEFAULT_CONFIG.defaultProfile).toBe("quality");
    expect(DEFAULT_CONFIG.models.quality.fast).toBe("x-ai/grok-4.3");
    expect(DEFAULT_CONFIG.models.quality.expert).toBe("x-ai/grok-4.20");
    expect(DEFAULT_CONFIG.models.quality.research).toBe("perplexity/sonar-reasoning-pro");
    expect(DEFAULT_CONFIG.models.quality.deepResearch).toBe("perplexity/sonar-deep-research");
    expect(DEFAULT_CONFIG.web.search.enabled).toBe(true);
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
    expect(resolveModel(DEFAULT_CONFIG, "economy", "research")).toBe("perplexity/sonar-pro");
  });
});

describe("modeAllowsWeb", () => {
  it("allows web on retrieve mode", () => {
    expect(modeAllowsWeb("retrieve")).toBe(true);
  });
});

describe("resolveWebOptions", () => {
  it("forces search on in retrieve mode even when config disables it, but does not force fetch", () => {
    const config = {
      ...DEFAULT_CONFIG,
      web: {
        ...DEFAULT_CONFIG.web,
        search: { ...DEFAULT_CONFIG.web.search, enabled: false },
        fetch: { ...DEFAULT_CONFIG.web.fetch, enabled: false },
      },
    };
    const web = resolveWebOptions(config, "retrieve", { noWeb: false, deprecatedWebFlag: false, fetchFlag: false });
    expect(web.searchEnabled).toBe(true);
    // Fetch is not forced in retrieve mode (raw_content extraction not wired).
    expect(web.fetchEnabled).toBe(false);
  });

  it("still enables fetch in retrieve mode when --web-fetch is passed", () => {
    const config = {
      ...DEFAULT_CONFIG,
      web: {
        ...DEFAULT_CONFIG.web,
        fetch: { ...DEFAULT_CONFIG.web.fetch, enabled: false },
      },
    };
    const web = resolveWebOptions(config, "retrieve", { noWeb: false, deprecatedWebFlag: false, fetchFlag: true });
    expect(web.fetchEnabled).toBe(true);
  });

  it("respects --no-web in retrieve mode", () => {
    const web = resolveWebOptions(DEFAULT_CONFIG, "retrieve", { noWeb: true, deprecatedWebFlag: false, fetchFlag: false });
    expect(web.searchEnabled).toBe(false);
  });
});

describe("validateWebOptions", () => {
  const webOn = resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: false, deprecatedWebFlag: false, fetchFlag: false });

  it("rejects allow and block lists together", () => {
    expect(() =>
      validateWebOptions(
        { ...webOn, allowedDomains: ["example.com"], blockedDomains: ["spam.example"] },
        { noWeb: false, deprecatedWebFlag: false, fetchFlag: false },
      ),
    ).toThrow("Cannot combine");
  });

  it("rejects --web-fetch with --no-web", () => {
    expect(() =>
      validateWebOptions(
        resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: true, deprecatedWebFlag: false, fetchFlag: true }),
        { noWeb: true, deprecatedWebFlag: false, fetchFlag: true },
      ),
    ).toThrow('Flag "--web-fetch" has no effect');
  });
});

describe("assertWebToolsCompatible", () => {
  const webOn = resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: false, deprecatedWebFlag: false, fetchFlag: false });

  it("allows Grok models with web enabled", () => {
    expect(() => assertWebToolsCompatible(DEFAULT_CONFIG, "quality", "expert", webOn)).not.toThrow();
  });

  it("rejects Perplexity expert overrides with web enabled", () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: {
        ...DEFAULT_CONFIG.models,
        quality: { ...DEFAULT_CONFIG.models.quality, expert: "perplexity/sonar-pro-search" },
      },
    };

    expect(() => assertWebToolsCompatible(config, "quality", "expert", webOn)).toThrow(
      "does not support OpenRouter server tools",
    );
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
        outputStyle: "brief",
        retrieve: false,
        webProvider: "openrouter",
        json: false,
        web: { noWeb: false, deprecatedWebFlag: false, fetchFlag: false },
        x: { enabled: false, only: false, network: "off" },
        bookmarks: { enabled: false, only: false, related: false },
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
        outputStyle: "brief",
        retrieve: false,
        webProvider: "openrouter",
        json: false,
        web: { noWeb: false, deprecatedWebFlag: false, fetchFlag: false },
        x: { enabled: false, only: false, network: "off" },
        bookmarks: { enabled: false, only: false, related: false },
      }),
    ).toMatchObject({ mode: "expert", profile: "quality" });
  });
});
