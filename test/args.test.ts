import { describe, expect, it } from "vitest";
import { parseArgs, wantsJson } from "../src/args.js";

describe("parseArgs", () => {
  it("parses a default prompt", () => {
    expect(parseArgs(["Compare Next.js and Remix"])).toMatchObject({
      mode: "auto",
      profile: "quality",
      outputFormat: "brief",
      json: false,
      prompt: "Compare Next.js and Remix",
      web: { noWeb: false, deprecatedWebFlag: false, fetchFlag: false },
    });
  });

  it("parses subcommands", () => {
    expect(parseArgs(["research", "React Server Components"])).toMatchObject({
      mode: "research",
      modeExplicit: true,
      prompt: "React Server Components",
    });

    expect(parseArgs(["deepresearch", "React Server Components"])).toMatchObject({
      mode: "deepresearch",
      modeExplicit: true,
      prompt: "React Server Components",
    });
  });

  it("parses flags", () => {
    expect(parseArgs(["--mode", "expert", "--json", "--economy", "Prompt"])).toMatchObject({
      mode: "expert",
      modeExplicit: true,
      profile: "economy",
      profileExplicit: true,
      outputFormat: "brief",
      json: true,
      prompt: "Prompt",
    });
  });

  it("parses --web-fetch", () => {
    expect(parseArgs(["--web-fetch", "Prompt"]).web.fetchFlag).toBe(true);
  });

  it("parses web flags", () => {
    expect(
      parseArgs([
        "--no-web",
        "--web",
        "--web-fetch",
        "--web-engine",
        "exa",
        "--web-max-results",
        "3",
        "--web-max-total-results",
        "8",
        "--web-allowed-domains",
        "example.com,docs.example.com",
        "Prompt",
      ]),
    ).toMatchObject({
      web: {
        noWeb: true,
        deprecatedWebFlag: true,
        fetchFlag: true,
        engine: "exa",
        maxResults: 3,
        maxTotalResults: 8,
        allowedDomains: ["example.com", "docs.example.com"],
      },
    });
  });

  it("parses report and raw formats", () => {
    expect(parseArgs(["--report", "Prompt"])).toMatchObject({ outputFormat: "report" });
    expect(parseArgs(["--raw", "Prompt"])).toMatchObject({ outputFormat: "raw" });
  });

  it("throws for missing prompts", () => {
    expect(() => parseArgs([])).toThrow("Missing prompt");
  });

  it("throws for unknown flags", () => {
    expect(() => parseArgs(["--jsno", "Prompt"])).toThrow("Unknown option: --jsno");
    expect(() => parseArgs(["-x", "Prompt"])).toThrow("Unknown option: -x");
  });

  it("allows prompts that start with a dash after --", () => {
    expect(parseArgs(["--", "--not-a-flag"])).toMatchObject({
      prompt: "--not-a-flag",
    });
  });

  it("parses --max-cost", () => {
    expect(parseArgs(["--max-cost", "0.05", "Prompt"])).toMatchObject({ maxCost: 0.05 });
    expect(() => parseArgs(["--max-cost", "invalid", "Prompt"])).toThrow("Invalid value for --max-cost");
    expect(() => parseArgs(["--max-cost", "-1", "Prompt"])).toThrow("Invalid value for --max-cost");
  });

  it("detects json intent before full parsing", () => {
    expect(wantsJson(["--json"])).toBe(true);
    expect(wantsJson(["--jsno"])).toBe(false);
  });

  it("parses retrieve as a positional mode", () => {
    expect(parseArgs(["retrieve", "React 19 patterns"])).toMatchObject({
      mode: "retrieve",
      modeExplicit: true,
      prompt: "React 19 patterns",
    });
  });

  it("parses --retrieve flag", () => {
    expect(parseArgs(["--retrieve", "Prompt"])).toMatchObject({ retrieve: true });
  });

  it("parses --output style", () => {
    expect(parseArgs(["--output", "results", "Prompt"])).toMatchObject({ outputStyle: "results" });
    expect(parseArgs(["--output", "both", "Prompt"])).toMatchObject({ outputStyle: "both" });
    expect(parseArgs(["--output", "brief", "Prompt"])).toMatchObject({ outputStyle: "brief" });
  });

  it("rejects invalid --output style", () => {
    expect(() => parseArgs(["--output", "verbose", "Prompt"])).toThrow("Invalid --output style");
  });

  it("parses --schema inline json", () => {
    expect(parseArgs(["--schema", '{"type":"object"}', "Prompt"])).toMatchObject({ schema: '{"type":"object"}' });
  });

  it("parses --schema file path", () => {
    expect(parseArgs(["--schema", "schema.json", "Prompt"])).toMatchObject({ schema: "schema.json" });
  });

  it("parses --web-provider", () => {
    expect(parseArgs(["--web-provider", "openrouter", "Prompt"])).toMatchObject({ webProvider: "openrouter" });
  });

  it("rejects invalid --web-provider", () => {
    expect(() => parseArgs(["--web-provider", "tavily", "Prompt"])).toThrow("Invalid --web-provider");
  });

  it("defaults outputStyle to brief and retrieve to false", () => {
    expect(parseArgs(["Prompt"])).toMatchObject({ outputStyle: "brief", retrieve: false, webProvider: "openrouter" });
  });
});
