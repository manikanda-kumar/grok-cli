import { describe, expect, it } from "vitest";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { formatJson, formatMarkdown, formatRaw } from "../src/formatters.js";
import type { PipelineResult } from "../src/types.js";

const usage = addUsageCall(emptyUsage(), {
  role: "expert",
  model: "x-ai/grok-4.20",
  promptTokens: 100,
  completionTokens: 25,
  costUsd: 0.01,
});

const result: PipelineResult = {
  mode: "expert",
  profile: "quality",
  outputFormat: "brief",
  content: "# Decision Brief\n\n## Recommendation\nUse Next.js.",
  sources: [{ url: "https://example.com" }],
  warnings: [],
  usage,
};

describe("formatters", () => {
  it("adds a cost footer to markdown", () => {
    const output = formatMarkdown(result);
    expect(output).toContain("# Decision Brief");
    expect(output).toContain("Cost: $0.0100");
    expect(output).toContain("Models: x-ai/grok-4.20");
  });

  it("formats stable JSON", () => {
    const output = JSON.parse(formatJson(result));
    expect(output.mode).toBe("expert");
    expect(output.usage.cost_usd).toBe(0.01);
    expect(output.sources).toEqual([{ url: "https://example.com" }]);
  });

  it("formats raw with footer", () => {
    expect(formatRaw(result)).toContain("Use Next.js.");
    expect(formatRaw(result)).toContain("Cost: $0.0100");
  });
});
