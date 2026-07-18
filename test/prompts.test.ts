import { describe, expect, it } from "vitest";
import {
  buildJsonFromResearchMessages,
  buildRetrieveMessages,
  buildSchemaMessages,
  buildSingleCallMessages,
  withXSignal,
} from "../src/prompts.js";

describe("buildSingleCallMessages", () => {
  it("adds web search instructions when web is enabled", () => {
    const messages = buildSingleCallMessages("Prompt", "brief", false, true);
    expect(messages[0]?.content).toContain("live web search");
    expect(messages[0]?.content).toContain("## Sources");
  });

  it("omits web instructions when web is disabled", () => {
    const messages = buildSingleCallMessages("Prompt", "brief", false, false);
    expect(messages[0]?.content).not.toContain("live web search");
  });

  it("adds web instructions for json mode", () => {
    const messages = buildSingleCallMessages("Prompt", "brief", true, true);
    expect(messages[0]?.content).toContain("Return only a JSON object");
    expect(messages[0]?.content).toContain("live web search");
  });

  it("injects X signal into system and user when provided", () => {
    const messages = buildSingleCallMessages("Should we use Bun?", "brief", false, true, "Camps: pro vs con");
    expect(messages[0]?.content).toContain("X/Twitter sample");
    expect(messages[0]?.content).toContain("## X signal");
    expect(messages[1]?.content).toContain("Live X/Twitter public conversation");
    expect(messages[1]?.content).toContain("Camps: pro vs con");
  });
});

describe("withXSignal", () => {
  it("returns prompt unchanged when no X markdown", () => {
    expect(withXSignal("hi")).toBe("hi");
  });
});

describe("buildJsonFromResearchMessages", () => {
  it("asks for decision JSON grounded in research", () => {
    const messages = buildJsonFromResearchMessages("Q?", "Research text", ["https://a.example"]);
    expect(messages[0]?.content).toContain("recommendation");
    expect(messages[1]?.content).toContain("Research text");
    expect(messages[1]?.content).toContain("https://a.example");
  });
});

describe("buildRetrieveMessages", () => {
  it("instructs the model to emit Tavily-style JSON", () => {
    const messages = buildRetrieveMessages("latest React 19 patterns");
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("results");
    expect(messages[0]?.content).toContain("title");
    expect(messages[0]?.content).toContain("url");
    expect(messages[0]?.content).toContain("content");
    expect(messages[1]?.content).toBe("latest React 19 patterns");
  });
});

describe("buildSchemaMessages", () => {
  it("embeds the schema and forbids non-JSON output", () => {
    const schema = '{"type":"object","properties":{"name":{"type":"string"}}}';
    const messages = buildSchemaMessages("Prompt", schema);
    expect(messages[0]?.content).toContain("JSON Schema");
    expect(messages[0]?.content).toContain(schema);
    expect(messages[0]?.content).toContain("Do not include any text outside the JSON");
    expect(messages[1]?.content).toBe("Prompt");
  });
});
