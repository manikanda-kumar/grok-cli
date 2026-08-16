import { describe, expect, it, vi } from "vitest";
import { modeAllowsWeb, resolveWebOptions } from "../src/config.js";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { parseDecisionAnswer, runMode } from "../src/modes.js";
import type { PipelineResult } from "../src/types.js";

function options(overrides: Partial<Parameters<typeof runMode>[1]> = {}): Parameters<typeof runMode>[1] {
  return {
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

function fakeRetrieveResult(role: string, model: string): PipelineResult {
  return {
    ...fakeResult(role, model, JSON.stringify({ results: [{ title: "R", url: "https://r.example", content: "snip" }], answer: "sum" })),
    sources: [{ url: "https://r.example", title: "R" }],
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

  it("uses two-pass research then JSON format when --json and web are both on", async () => {
    const decisionJson = JSON.stringify({
      recommendation: "Prefer hybrid routing.",
      key_facts: ["Open MoE is cheaper at scale."],
      tradeoffs: ["Ops burden on self-host."],
      risks: ["Token inefficiency."],
      open_questions: ["Your daily token volume?"],
      confidence: "high",
    });
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        ...fakeResult("expert", "x-ai/grok-4.20", "Markdown research with facts."),
        sources: [{ url: "https://example.com/cost" }],
      })
      .mockResolvedValueOnce(fakeResult("json_format", "x-ai/grok-4.20", decisionJson));

    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, json: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(2);
    expect(caller.mock.calls[0]?.[0]).toMatchObject({
      role: "expert",
      web: expect.objectContaining({ searchEnabled: true }),
    });
    expect(caller.mock.calls[0]?.[0].json).toBeFalsy();
    expect(caller.mock.calls[1]?.[0]).toMatchObject({
      role: "json_format",
      json: true,
    });
    expect(caller.mock.calls[1]?.[0].web).toBeUndefined();
    expect(result.answer?.recommendation).toBe("Prefer hybrid routing.");
    expect(result.sources).toEqual([{ url: "https://example.com/cost" }]);
    expect(result.warnings.some((w) => w.includes("two-pass"))).toBe(true);
  });

  it("keeps single-pass --json when web is off", async () => {
    const decisionJson = JSON.stringify({
      recommendation: "Use Bun.",
      key_facts: ["Fast."],
      tradeoffs: [],
      risks: [],
      open_questions: [],
      confidence: "medium",
    });
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", decisionJson));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({
        mode: "expert",
        modeExplicit: true,
        json: true,
        web: { noWeb: true, deprecatedWebFlag: false, fetchFlag: false },
      }),
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(1);
    expect(caller.mock.calls[0]?.[0]).toMatchObject({ json: true });
    expect(result.answer?.recommendation).toBe("Use Bun.");
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
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar-pro", "Research answer"));
    await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true, profile: "economy", profileExplicit: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "perplexity/sonar-pro" }));
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
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-reasoning-pro", "Facts"))
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

  it("aborts a single call when --max-cost is exceeded", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    await expect(
      runMode(DEFAULT_CONFIG, options({ mode: "expert", modeExplicit: true, maxCost: 0.0005 }), caller),
    ).rejects.toThrow("exceeded limit of $0.0005");
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it("runs multi legs sequentially under --max-cost and stops dispatching once exceeded", async () => {
    const caller = vi.fn().mockImplementation((call) => Promise.resolve(fakeResult(call.role, "x-ai/grok-4.20", call.role)));

    // Each call costs $0.001. Cap $0.0015: research ($0.001) ok, engineering crosses to
    // $0.002 > cap. product, skeptic, and synthesis must never be dispatched (no overspend).
    await expect(
      runMode(DEFAULT_CONFIG, options({ mode: "multi", modeExplicit: true, maxCost: 0.0015 }), caller),
    ).rejects.toThrow("exceeded limit of $0.0015");

    const dispatchedRoles = caller.mock.calls.map((c) => c[0].role);
    expect(dispatchedRoles).toEqual(["research", "engineering"]);
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
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-reasoning-pro", "Facts"))
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
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-reasoning-pro", "Facts"))
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

describe("runMode retrieve", () => {
  it("routes retrieve mode to a retrieval call with web enabled", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "retrieve", modeExplicit: true, json: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "retrieve",
        model: "x-ai/grok-4.20",
        json: true,
        web: expect.objectContaining({ searchEnabled: true, fetchEnabled: false }),
      }),
    );
    expect(result.searchResults).toBeDefined();
    expect(result.searchResults?.length).toBeGreaterThanOrEqual(1);
    expect(result.searchResults?.[0]?.url).toBe("https://r.example");
    expect(result.answer).toBeUndefined();
  });

  it("forces web search on in retrieve mode even when config defaults it off", async () => {
    const config = { ...DEFAULT_CONFIG, web: { ...DEFAULT_CONFIG.web, search: { ...DEFAULT_CONFIG.web.search, enabled: false } } };
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    await runMode(DEFAULT_CONFIG, options({ mode: "retrieve", modeExplicit: true }), caller);
    expect(caller.mock.calls[0]?.[0].web?.searchEnabled).toBe(true);
    void config;
  });

  it("respects --no-web in retrieve mode", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    await runMode(
      DEFAULT_CONFIG,
      options({ mode: "retrieve", modeExplicit: true, web: { noWeb: true, deprecatedWebFlag: false, fetchFlag: false } }),
      caller,
    );
    expect(caller.mock.calls[0]?.[0].web?.searchEnabled).toBe(false);
  });

  it("sets content to the answer in --output results mode", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "retrieve", modeExplicit: true, outputStyle: "results", json: true }),
      caller,
    );
    expect(result.content).toBe("sum");
  });

  it("runs a second synthesis call in --output both mode", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"))
      .mockResolvedValueOnce(fakeResult("synthesis", "x-ai/grok-4.20", "Synthesized brief"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "retrieve", modeExplicit: true, outputStyle: "both", json: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledTimes(2);
    expect(caller.mock.calls[1]?.[0].role).toBe("synthesis");
    // Synthesis leg should not have web enabled (grounding already in sources block).
    expect(caller.mock.calls[1]?.[0].web).toBeUndefined();
    expect(result.content).toBe("Synthesized brief");
    expect(result.searchResults?.[0]?.url).toBe("https://r.example");
    expect(result.usage.calls).toHaveLength(2);
  });

  it("does not force DecisionAnswer parsing in retrieve mode", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "retrieve", modeExplicit: true, json: true }),
      caller,
    );
    expect(result.answer).toBeUndefined();
  });
});

describe("runMode --retrieve on a Grok mode", () => {
  it("activates the retrieve path when --retrieve is set on expert", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, retrieve: true, json: true }),
      caller,
    );
    expect(caller.mock.calls[0]?.[0].role).toBe("retrieve");
    expect(result.searchResults?.[0]?.url).toBe("https://r.example");
  });

  it("activates the retrieve path when --output results is set on expert", async () => {
    const caller = vi.fn().mockResolvedValue(fakeRetrieveResult("retrieve", "x-ai/grok-4.20"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, outputStyle: "results", json: true }),
      caller,
    );
    expect(caller.mock.calls[0]?.[0].role).toBe("retrieve");
    expect(result.searchResults).toBeDefined();
  });
});

describe("runMode --schema", () => {
  it("parses schema-constrained JSON output into schemaResult", async () => {
    const caller = vi.fn().mockResolvedValue(
      fakeResult("schema", "x-ai/grok-4.20", JSON.stringify({ name: "Bun", stable: true })),
    );
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );

    expect(caller).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "schema",
        json: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("JSON Schema") }),
        ]),
      }),
    );
    expect(result.schemaResult).toEqual({ name: "Bun", stable: true });
    expect(result.answer).toBeUndefined();
  });

  it("leaves schemaResult undefined when the model returns invalid JSON", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("schema", "x-ai/grok-4.20", "not json"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );
    expect(result.schemaResult).toBeUndefined();
  });

  it("does not parse DecisionAnswer when --schema is set", async () => {
    const caller = vi.fn().mockResolvedValue(
      fakeResult("schema", "x-ai/grok-4.20", JSON.stringify({ custom: "value" })),
    );
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );
    expect(result.answer).toBeUndefined();
  });

  it("warns when --schema overrides deepresearch mode", async () => {
    const caller = vi.fn().mockResolvedValue(
      fakeResult("schema", "x-ai/grok-4.20", JSON.stringify({ winner: "Go" })),
    );
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("--schema overrides deepresearch mode")]),
    );
    expect(caller.mock.calls[0]?.[0].role).toBe("schema");
  });

  it("warns when --schema overrides multi mode", async () => {
    const caller = vi.fn().mockResolvedValue(
      fakeResult("schema", "x-ai/grok-4.20", JSON.stringify({ winner: "Go" })),
    );
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "multi", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("--schema overrides multi mode")]),
    );
    // Should only make 1 call (schema), not the 5-call multi fan-out.
    expect(caller).toHaveBeenCalledTimes(1);
  });

  it("warns when schema JSON parse fails", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("schema", "x-ai/grok-4.20", "not valid json"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "expert", modeExplicit: true, schema: '{"type":"object"}', json: true }),
      caller,
    );
    expect(result.schemaResult).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("--schema output was not valid JSON")]),
    );
  });
});

describe("runMode --retrieve on non-web modes", () => {
  it("warns when --retrieve is ignored on deepresearch", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar-deep-research", "Research"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true, retrieve: true, json: true }),
      caller,
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("--retrieve/--output was ignored")]),
    );
    // Should still run as normal deepresearch, not retrieve.
    expect(caller.mock.calls[0]?.[0].role).toBe("deepresearch");
  });

  it("warns when --output results is ignored on deepresearch", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("deepresearch", "perplexity/sonar-deep-research", "Research"));
    const result = await runMode(
      DEFAULT_CONFIG,
      options({ mode: "deepresearch", modeExplicit: true, outputStyle: "results", json: true }),
      caller,
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("--retrieve/--output was ignored")]),
    );
  });
});

describe("parseDecisionAnswer", () => {
  it("parses a valid decision object", () => {
    const { answer, warning } = parseDecisionAnswer(
      JSON.stringify({
        recommendation: "Go hybrid.",
        key_facts: ["A"],
        tradeoffs: ["B"],
        risks: ["C"],
        open_questions: ["D"],
        confidence: "high",
      }),
    );
    expect(warning).toBeUndefined();
    expect(answer?.recommendation).toBe("Go hybrid.");
    expect(answer?.confidence).toBe("high");
  });

  it("rejects bare JSON numbers (json_object+tools failure mode)", () => {
    const { answer, warning } = parseDecisionAnswer("-1.5E-05");
    expect(answer).toBeUndefined();
    expect(warning).toMatch(/not a decision object/);
  });

  it("rejects non-JSON markdown", () => {
    const { answer, warning } = parseDecisionAnswer("**Not JSON**");
    expect(answer).toBeUndefined();
    expect(warning).toMatch(/non-JSON/);
  });
});
