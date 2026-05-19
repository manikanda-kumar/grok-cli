import { describe, expect, it } from "vitest";
import { addUsageCall, emptyUsage, formatCost } from "../src/cost.js";

describe("cost helpers", () => {
  it("accumulates token usage and costs", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "expert",
      model: "x-ai/grok-4.20",
      promptTokens: 100,
      completionTokens: 25,
      costUsd: 0.01,
    });

    expect(usage.totalPromptTokens).toBe(100);
    expect(usage.totalCompletionTokens).toBe(25);
    expect(usage.costUsd).toBe(0.01);
    expect(usage.calls).toHaveLength(1);
  });

  it("leaves cost undefined when any call has unknown cost", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "expert",
      model: "x-ai/grok-4.20",
      promptTokens: 100,
      completionTokens: 25,
    });

    expect(usage.costUsd).toBeUndefined();
    expect(formatCost(usage)).toBe("unavailable");
  });

  it("formats known cost", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "research",
      model: "perplexity/sonar-pro-search",
      promptTokens: 1000,
      completionTokens: 500,
      costUsd: 0.042125,
    });

    expect(formatCost(usage)).toBe("$0.0421");
  });
});
