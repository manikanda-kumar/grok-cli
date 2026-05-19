import { describe, expect, it, vi } from "vitest";
import { modeAllowsWeb, resolveWebOptions } from "../src/config.js";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { runMode } from "../src/modes.js";
import type { PipelineResult } from "../src/types.js";

function options(overrides: Partial<Parameters<typeof runMode>[1]> = {}): Parameters<typeof runMode>[1] {
  return {
    prompt: "Prompt",
    mode: "auto",
    modeExplicit: false,
    profile: "quality",
    profileExplicit: false,
    outputFormat: "brief",
    json: false,
    web: { noWeb: false, deprecatedWebFlag: false, fetchFlag: false },
    ...overrides,
  };
}

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

describe("modeAllowsWeb", () => {
  it("allows web only on single-call Grok modes", () => {
    expect(modeAllowsWeb("auto")).toBe(true);
    expect(modeAllowsWeb("fast")).toBe(true);
    expect(modeAllowsWeb("expert")).toBe(true);
    expect(modeAllowsWeb("deepresearch")).toBe(false);
    expect(modeAllowsWeb("multi")).toBe(false);
  });
});

describe("resolveWebOptions", () => {
  it("enables search by default on expert", () => {
    expect(resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: false, deprecatedWebFlag: false, fetchFlag: false }).searchEnabled).toBe(true);
  });

  it("disables search with --no-web even when config default is on", () => {
    expect(resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: true, deprecatedWebFlag: false, fetchFlag: false }).searchEnabled).toBe(false);
  });

  it("disables search on deepresearch", () => {
    expect(resolveWebOptions(DEFAULT_CONFIG, "deepresearch", { noWeb: false, deprecatedWebFlag: false, fetchFlag: false }).searchEnabled).toBe(false);
  });

  it("enables fetch when --web-fetch is set", () => {
    expect(
      resolveWebOptions(DEFAULT_CONFIG, "expert", { noWeb: false, deprecatedWebFlag: false, fetchFlag: true }).fetchEnabled,
    ).toBe(true);
  });
});

describe("runMode", () => {
  it("includes web search instructions when web is enabled", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    await runMode(DEFAULT_CONFIG, options({ mode: "expert", modeExplicit: true }), caller);

    expect(caller.mock.calls[0]?.[0].messages[0]?.content).toContain("live web search");
  });

  it("routes expert mode to the expert model with web enabled", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "x-ai/grok-4.20",
        role: "expert",
        web: expect.objectContaining({ searchEnabled: true }),
      }),
    );
    expect(result.content).toBe("Expert answer");
    expect(result.web?.searchEnabled).toBe(true);
  });

  it("disables web tools for expert when --no-web is set", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, web: { noWeb: true, deprecatedWebFlag: false, fetchFlag: false } }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ web: expect.objectContaining({ searchEnabled: false }) }));
  });

  it("routes deepresearch to sonar deep research", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar-deep-research", "Research answer"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "perplexity/sonar-deep-research",
        role: "deepresearch",
        web: undefined,
      }),
    );
    expect(result.mode).toBe("deepresearch");
  });

  it("maps deprecated research mode to deepresearch with a warning", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar-deep-research", "Research answer"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "research", modeExplicit: true }),
      caller,
    );

    expect(result.mode).toBe("deepresearch");
    expect(result.warnings).toContain('Mode "research" is deprecated; use "deepresearch" instead.');
    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "perplexity/sonar-deep-research" }));
  });

  it("routes economy deepresearch to economy sonar", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar", "Research answer"));
    await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true, profile: "economy", profileExplicit: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "perplexity/sonar" }));
  });

  it("warns when deprecated --web is passed", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, web: { noWeb: false, deprecatedWebFlag: true, fetchFlag: false } }),
      caller,
    );

    expect(result.warnings).toContain(
      'Flag "--web" is deprecated; web search is on by default. Use --no-web to disable.',
    );
  });

  it("runs multi mode research, analyses, and synthesis without web tools", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-pro-search", "Facts"))
      .mockResolvedValueOnce(fakeResult("engineering", "x-ai/grok-4.20", "Engineering"))
      .mockResolvedValueOnce(fakeResult("product", "x-ai/grok-4.20", "Product"))
      .mockResolvedValueOnce(fakeResult("skeptic", "x-ai/grok-4.20", "Skeptic"))
      .mockResolvedValueOnce(fakeResult("synthesis", "x-ai/grok-4.20", "Final"));

    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "multi", modeExplicit: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(5);
    for (const call of caller.mock.calls) {
      expect(call[0].web).toBeUndefined();
    }
    expect(result.content).toBe("Final");
    expect(result.usage.calls).toHaveLength(5);
    expect(result.web?.searchEnabled).toBe(false);
  });

  it("parses JSON decision answers", async () => {
    const caller = vi.fn().mockResolvedValue(
      fakeResult(
        "expert",
        "x-ai/grok-4.20",
        JSON.stringify({
          recommendation: "Use Postgres.",
          key_facts: ["Reliable transactions."],
          tradeoffs: ["Operational overhead."],
          risks: ["Scaling write hotspots."],
          open_questions: ["Data volume?"],
          confidence: "high",
        }),
      ),
    );

    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, json: true }),
      caller,
    );

    expect(result.answer).toMatchObject({
      recommendation: "Use Postgres.",
      keyFacts: ["Reliable transactions."],
      openQuestions: ["Data volume?"],
      confidence: "high",
    });
    expect(caller).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("Return only a JSON object") }),
        ]),
      }),
    );
  });

  it("continues multi mode when one analysis role fails", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-pro-search", "Facts"))
      .mockResolvedValueOnce(fakeResult("engineering", "x-ai/grok-4.20", "Engineering"))
      .mockRejectedValueOnce(new Error("product unavailable"))
      .mockResolvedValueOnce(fakeResult("skeptic", "x-ai/grok-4.20", "Skeptic"))
      .mockResolvedValueOnce(fakeResult("synthesis", "x-ai/grok-4.20", "Final"));

    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "multi", modeExplicit: true }),
      caller,
    );

    expect(result.content).toBe("Final");
    expect(result.warnings).toEqual(["product analysis failed: Error: product unavailable"]);
    expect(result.usage.calls).toHaveLength(4);
  });

  it("fails multi mode when all analysis roles fail", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-pro-search", "Facts"))
      .mockRejectedValueOnce(new Error("engineering unavailable"))
      .mockRejectedValueOnce(new Error("product unavailable"))
      .mockRejectedValueOnce(new Error("skeptic unavailable"));

    await expect(
      runMode(DEFAULT_CONFIG, options({ mode: "multi", modeExplicit: true }), caller),
    ).rejects.toThrow("Multi-agent mode failed because all Grok analysis roles failed");
  });

  it("fails multi mode when research fails", async () => {
    const caller = vi.fn().mockRejectedValueOnce(new Error("research unavailable"));

    await expect(
      runMode(DEFAULT_CONFIG, options({ mode: "multi", modeExplicit: true }), caller),
    ).rejects.toThrow("research unavailable");
    expect(caller).toHaveBeenCalledTimes(1);
  });
});
