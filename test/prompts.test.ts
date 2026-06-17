import { describe, expect, it } from "vitest";
import { buildRetrieveMessages, buildSchemaMessages, buildSingleCallMessages } from "../src/prompts.js";

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
