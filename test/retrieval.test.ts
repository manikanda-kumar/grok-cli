import { describe, expect, it } from "vitest";
import { extractSources } from "../src/openrouter.js";
import { mergeRetrieveResults, parseRetrieveContent, resultsFromSources } from "../src/retrieval.js";
import type { OpenRouterResponse } from "../src/types.js";

describe("parseRetrieveContent", () => {
  it("parses a well-formed retrieve payload", () => {
    const payload = parseRetrieveContent(
      JSON.stringify({
        results: [
          { title: "Result A", url: "https://a.example", content: "Snippet A" },
          { title: "Result B", url: "https://b.example", content: "Snippet B", score: 0.9 },
        ],
        answer: "Short summary.",
      }),
    );

    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]).toMatchObject({ title: "Result A", url: "https://a.example", content: "Snippet A" });
    expect(payload.results[1]?.score).toBe(0.9);
    expect(payload.answer).toBe("Short summary.");
  });

  it("returns empty results for invalid JSON", () => {
    expect(parseRetrieveContent("not json")).toEqual({ results: [] });
  });

  it("returns empty results when results is not an array", () => {
    expect(parseRetrieveContent(JSON.stringify({ results: "nope" }))).toEqual({ results: [] });
  });

  it("skips entries missing a url", () => {
    const payload = parseRetrieveContent(
      JSON.stringify({ results: [{ title: "No URL", content: "x" }, { url: "https://ok.example", title: "OK" }] }),
    );
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.url).toBe("https://ok.example");
  });

  it("preserves raw_content when present", () => {
    const payload = parseRetrieveContent(
      JSON.stringify({ results: [{ url: "https://x.example", title: "X", content: "snip", raw_content: "full text" }] }),
    );
    expect(payload.results[0]?.raw_content).toBe("full text");
  });
});

describe("resultsFromSources", () => {
  it("assigns descending scores by citation order", () => {
    const results = resultsFromSources([
      { url: "https://a.example", title: "A" },
      { url: "https://b.example", title: "B" },
      { url: "https://c.example", title: "C" },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score as number);
    expect(results[1]?.score).toBeGreaterThan(results[2]?.score as number);
    expect(results[0]?.score).toBeLessThanOrEqual(1);
  });

  it("returns empty for no sources", () => {
    expect(resultsFromSources([])).toEqual([]);
  });
});

describe("mergeRetrieveResults", () => {
  it("keeps model results and adds citation-only sources", () => {
    const merged = mergeRetrieveResults(
      {
        results: [{ title: "Model", url: "https://model.example", content: "snippet" }],
      },
      [{ url: "https://model.example" }, { url: "https://cite-only.example", title: "Cite" }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.url === "https://model.example")?.content).toBe("snippet");
    expect(merged.find((r) => r.url === "https://cite-only.example")?.title).toBe("Cite");
  });

  it("assigns scores to unscored results by order", () => {
    const merged = mergeRetrieveResults(
      { results: [{ title: "A", url: "https://a.example", content: "x" }] },
      [{ url: "https://b.example" }],
    );
    expect(merged.every((r) => r.score !== undefined)).toBe(true);
  });
});

describe("extractSources (re-exported from openrouter)", () => {
  it("merges citations and annotations", () => {
    const response: OpenRouterResponse = {
      citations: ["https://cite.example"],
      choices: [
        {
          message: {
            content: "Answer",
            annotations: [{ type: "url_citation", url_citation: { url: "https://anno.example", title: "Anno" } }],
          },
        },
      ],
    };
    const sources = extractSources(response);
    expect(sources).toEqual([
      { url: "https://cite.example" },
      { url: "https://anno.example", title: "Anno" },
    ]);
  });
});
