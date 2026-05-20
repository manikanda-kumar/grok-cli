import { describe, expect, it, vi } from "vitest";
import { buildTools, callOpenRouter, extractSources, OpenRouterError } from "../src/openrouter.js";

const webBase = {
  searchEnabled: true,
  fetchEnabled: false,
  engine: "auto",
  maxResults: 5,
  maxTotalResults: 10,
  fetchEngine: "auto",
  maxContentTokens: 50000,
};

describe("buildTools", () => {
  const webOn = webBase;

  it("attaches web_search for Grok when search is enabled", () => {
    expect(buildTools("x-ai/grok-4.20", webOn)).toEqual([
      {
        type: "openrouter:web_search",
        parameters: { max_results: 5, max_total_results: 10 },
      },
    ]);
  });

  it("omits tools for Perplexity models", () => {
    expect(buildTools("perplexity/sonar-pro-search", webOn)).toBeUndefined();
  });

  it("omits tools when search is disabled", () => {
    expect(buildTools("x-ai/grok-4.20", { ...webOn, searchEnabled: false })).toBeUndefined();
  });

  it("maps blocked domains to excluded_domains for web_search", () => {
    expect(buildTools("x-ai/grok-4.20", { ...webOn, blockedDomains: ["spam.example"] })).toEqual([
      {
        type: "openrouter:web_search",
        parameters: {
          max_results: 5,
          max_total_results: 10,
          excluded_domains: ["spam.example"],
        },
      },
    ]);
  });

  it("keeps blocked_domains for web_fetch", () => {
    expect(buildTools("x-ai/grok-4.20", { ...webOn, fetchEnabled: true, blockedDomains: ["spam.example"] })).toEqual([
      {
        type: "openrouter:web_search",
        parameters: { max_results: 5, max_total_results: 10, excluded_domains: ["spam.example"] },
      },
      {
        type: "openrouter:web_fetch",
        parameters: { max_content_tokens: 50000, blocked_domains: ["spam.example"] },
      },
    ]);
  });

  it("attaches web_fetch when fetch is enabled", () => {
    expect(buildTools("x-ai/grok-4.20", { ...webOn, fetchEnabled: true })).toEqual([
      {
        type: "openrouter:web_search",
        parameters: { max_results: 5, max_total_results: 10 },
      },
      {
        type: "openrouter:web_fetch",
        parameters: { max_content_tokens: 50000 },
      },
    ]);
  });
});

describe("extractSources", () => {
  it("merges citations and url_citation annotations", () => {
    const sources = extractSources({
      citations: ["https://citation.example"],
      choices: [
        {
          message: {
            content: "Answer",
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://annotated.example", title: "Annotated" },
              },
            ],
          },
        },
      ],
    });

    expect(sources).toEqual([
      { url: "https://citation.example" },
      { url: "https://annotated.example", title: "Annotated" },
    ]);
  });
});

describe("callOpenRouter", () => {
  it("returns content, citations, annotations, and usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "x-ai/grok-4.20",
        choices: [
          {
            message: {
              content: "Answer",
              annotations: [
                {
                  type: "url_citation",
                  url_citation: { url: "https://annotated.example", title: "Annotated" },
                },
              ],
            },
          },
        ],
        citations: ["https://example.com"],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          cost: 0.001,
          server_tool_use: { web_search_requests: 2 },
        },
      }),
    });

    const result = await callOpenRouter(
      {
        apiKey: "test-openrouter-key",
        appName: "grok-cli",
        siteUrl: "https://example.com",
      },
      {
        role: "expert",
        model: "x-ai/grok-4.20",
        messages: [{ role: "user", content: "Prompt" }],
        web: webBase,
      },
      fetchMock,
    );

    expect(result.content).toBe("Answer");
    expect(result.sources).toEqual([
      { url: "https://example.com" },
      { url: "https://annotated.example", title: "Annotated" },
    ]);
    expect(result.usage.calls[0]).toMatchObject({ costUsd: 0.001, promptTokens: 10, completionTokens: 5 });
    expect(result.usage.serverToolUse).toEqual({ webSearchRequests: 2 });
    expect(result.web).toEqual({ searchEnabled: true, fetchEnabled: false });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.tools).toEqual([
      {
        type: "openrouter:web_search",
        parameters: { max_results: 5, max_total_results: 10 },
      },
    ]);
  });

  it("does not attach tools when web search is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Answer" } }] }),
    });

    await callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      {
        role: "expert",
        model: "x-ai/grok-4.20",
        messages: [{ role: "user", content: "Prompt" }],
        web: { ...webBase, searchEnabled: false, fetchEnabled: false },
      },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.tools).toBeUndefined();
  });

  it("sends json_object response format for models that support it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    });

    await callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }], json: true },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("omits json_object response format for Perplexity models", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    });

    await callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "research", model: "perplexity/sonar-pro-search", messages: [{ role: "user", content: "Prompt" }], json: true },
      fetchMock,
    );

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.response_format).toBeUndefined();
  });

  it("throws a helpful error for missing API keys", async () => {
    await expect(
      callOpenRouter(
        { appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        vi.fn(),
      ),
    ).rejects.toThrow("Missing OPENROUTER_API_KEY");
  });

  it("maps insufficient credit failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Insufficient credits",
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "research", model: "perplexity/sonar", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("OpenRouter credits or quota error: Insufficient credits");
  });

  it("maps model unavailable failures with the selected model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "No endpoints found for model",
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "expert", model: "x-ai/missing-model", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("Model unavailable: x-ai/missing-model. Try --economy or override the configured model alias.");
  });

  it("retries on network failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Success" } }] }),
      });

    const promise = callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
      fetchMock,
    );

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.content).toBe("Success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("maps invalid JSON responses to a friendly error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("OpenRouter returned an invalid JSON response. Please retry.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After header on 429", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "5" : null) },
        text: async () => "Rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Success" } }] }),
      });

    const promise = callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
      fetchMock,
    );

    // Backoff for attempt 1 is 2s; Retry-After of 5s must win.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;
    expect(result.content).toBe("Success");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("maps auth failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid token",
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("OpenRouter authentication failed: Invalid token");
  });

  it("maps tool-use failures when server tools were requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "No endpoints found that support tool use",
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        {
          role: "expert",
          model: "x-ai/grok-4.20",
          messages: [{ role: "user", content: "Prompt" }],
          web: webBase,
        },
        fetchMock,
      ),
    ).rejects.toThrow("Model does not support OpenRouter server tools");
  });

  it("maps web_fetch usage from server_tool_use", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Answer" } }],
        usage: { server_tool_use: { web_fetch_requests: 1, web_search_requests: 0 } },
      }),
    });

    const result = await callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      {
        role: "expert",
        model: "x-ai/grok-4.20",
        messages: [{ role: "user", content: "Prompt" }],
        web: { ...webBase, fetchEnabled: true },
      },
      fetchMock,
    );

    expect(result.usage.serverToolUse).toEqual({ webFetchRequests: 1 });
  });

  it("retries on transient failures (429, 5xx)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Success" } }] }),
      });

    const promise = callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
      fetchMock,
    );

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.content).toBe("Success");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("fails after 3 attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    const promise = callOpenRouter(
      { apiKey: "test-openrouter-key", appName: "grok-cli" },
      { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
      fetchMock,
    );
    const assertion = expect(promise).rejects.toThrow("OpenRouter provider error (429): Rate limited. Please retry.");

    await vi.runAllTimersAsync();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
