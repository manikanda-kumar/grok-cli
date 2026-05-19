import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";

describe("defaults", () => {
  it("uses quality-first Grok and Sonar defaults", () => {
    expect(DEFAULT_CONFIG.defaultProfile).toBe("quality");
    expect(DEFAULT_CONFIG.models.quality.fast).toBe("x-ai/grok-4.3");
    expect(DEFAULT_CONFIG.models.quality.expert).toBe("x-ai/grok-4.20");
    expect(DEFAULT_CONFIG.models.quality.research).toBe("perplexity/sonar-pro-search");
  });
});
