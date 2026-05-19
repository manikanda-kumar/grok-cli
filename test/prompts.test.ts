import { describe, expect, it } from "vitest";
import { buildSingleCallMessages } from "../src/prompts.js";

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
