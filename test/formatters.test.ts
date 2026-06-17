import { describe, expect, it } from "vitest";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { formatJson, formatMarkdown, formatRaw, formatRetrieveMarkdown } from "../src/formatters.js";
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
  answer: {
    recommendation: "Use Next.js.",
    keyFacts: ["It has strong routing conventions."],
    tradeoffs: ["Framework coupling."],
    risks: ["Vendor platform drift."],
    openQuestions: ["Team familiarity?"],
    confidence: "medium",
  },
  sources: [{ url: "https://example.com" }],
  warnings: [],
  usage: {
    ...usage,
    serverToolUse: { webSearchRequests: 2 },
  },
  web: { searchEnabled: true, fetchEnabled: false },
};

describe("formatters", () => {
  it("adds a cost footer to markdown", () => {
    const output = formatMarkdown(result);
    expect(output).toContain("# Decision Brief");
    expect(output).toContain("## Sources");
    expect(output).toContain("https://example.com");
    expect(output).toContain("Cost: $0.0100");
    expect(output).toContain("Models: x-ai/grok-4.20");
    expect(output).toContain("Web searches: 2");
  });

  it("formats stable JSON", () => {
    const output = JSON.parse(formatJson(result));
    expect(output.mode).toBe("expert");
    expect(output.answer.recommendation).toBe("Use Next.js.");
    expect(output.answer.key_facts).toEqual(["It has strong routing conventions."]);
    expect(output.answer.open_questions).toEqual(["Team familiarity?"]);
    expect(output.answer.keyFacts).toBeUndefined();
    expect(output.usage.cost_usd).toBe(0.01);
    expect(output.usage.server_tool_use).toEqual({ web_search_requests: 2 });
    expect(output.web).toEqual({ search_enabled: true, fetch_enabled: false });
    expect(output.sources).toEqual([{ url: "https://example.com" }]);
  });

  it("formats raw with footer", () => {
    expect(formatRaw(result)).toContain("Use Next.js.");
    expect(formatRaw(result)).toContain("Cost: $0.0100");
  });

  it("emits null cost fields when cost is unavailable", () => {
    const output = JSON.parse(
      formatJson({
        ...result,
        usage: addUsageCall(emptyUsage(), {
          role: "expert",
          model: "x-ai/grok-4.20",
          promptTokens: 100,
          completionTokens: 25,
        }),
      }),
    );

    expect(output.usage.cost_usd).toBeNull();
    expect(output.usage.calls[0].cost_usd).toBeNull();
  });

  it("includes search_results when present", () => {
    const output = JSON.parse(
      formatJson({
        ...result,
        searchResults: [
          { title: "Result A", url: "https://a.example", content: "Snippet A", score: 0.95 },
          { title: "Result B", url: "https://b.example", content: "Snippet B" },
        ],
      }),
    );

    expect(output.search_results).toHaveLength(2);
    expect(output.search_results[0]).toMatchObject({ title: "Result A", url: "https://a.example", score: 0.95 });
    expect(output.search_results[1]?.score).toBeUndefined();
  });

  it("omits search_results when not present", () => {
    const output = JSON.parse(formatJson(result));
    expect(output.search_results).toBeUndefined();
  });

  it("includes schema_result when present", () => {
    const output = JSON.parse(
      formatJson({ ...result, schemaResult: { name: "Next.js", version: "15" } }),
    );
    expect(output.schema_result).toEqual({ name: "Next.js", version: "15" });
  });

  it("formats retrieve markdown with results list and scores", () => {
    const output = formatRetrieveMarkdown({
      ...result,
      content: "Short answer.",
      searchResults: [
        { title: "Result A", url: "https://a.example", content: "Snippet A", score: 0.9 },
        { title: "Result B", url: "https://b.example", content: "Snippet B" },
      ],
    });
    expect(output).toContain("Short answer.");
    expect(output).toContain("## Results");
    expect(output).toContain("**Result A** (score: 0.9)");
    expect(output).toContain("https://a.example");
    expect(output).toContain("Snippet A");
  });

  it("formats retrieve markdown with empty content", () => {
    const output = formatRetrieveMarkdown({
      ...result,
      content: "",
      searchResults: [{ title: "Only", url: "https://only.example", content: "x" }],
    });
    expect(output).toContain("## Results");
    expect(output).not.toContain("Short answer.");
  });
});
