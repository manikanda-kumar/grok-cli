import { describe, expect, it, vi } from "vitest";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { runMode } from "../src/modes.js";
import type { PipelineResult } from "../src/types.js";

function fakeResult(role: string, model: string, content: string): PipelineResult {
  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "brief",
    content,
    sources: [],
    warnings: [],
    usage: addUsageCall(emptyUsage(), { role, model, promptTokens: 10, completionTokens: 5, costUsd: 0.001 }),
  };
}

describe("runMode", () => {
  it("routes expert mode to the expert model", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    const result = await runMode(
      DEFAULT_CONFIG,
      { prompt: "Prompt", mode: "expert", profile: "quality", outputFormat: "brief", json: false },
      caller,
    );

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "x-ai/grok-4.20", role: "expert" }));
    expect(result.content).toBe("Expert answer");
  });

  it("routes economy research to sonar", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("research", "perplexity/sonar", "Research answer"));
    await runMode(
      DEFAULT_CONFIG,
      { prompt: "Prompt", mode: "research", profile: "economy", outputFormat: "brief", json: false },
      caller,
    );

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "perplexity/sonar", role: "research" }));
  });

  it("runs multi mode research, analyses, and synthesis", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-pro-search", "Facts"))
      .mockResolvedValueOnce(fakeResult("engineering", "x-ai/grok-4.20", "Engineering"))
      .mockResolvedValueOnce(fakeResult("product", "x-ai/grok-4.20", "Product"))
      .mockResolvedValueOnce(fakeResult("skeptic", "x-ai/grok-4.20", "Skeptic"))
      .mockResolvedValueOnce(fakeResult("synthesis", "x-ai/grok-4.20", "Final"));

    const result = await runMode(
      DEFAULT_CONFIG,
      { prompt: "Prompt", mode: "multi", profile: "quality", outputFormat: "brief", json: false },
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(5);
    expect(result.content).toBe("Final");
    expect(result.usage.calls).toHaveLength(5);
  });
});
