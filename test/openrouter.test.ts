import { describe, expect, it, vi } from "vitest";
import { callOpenRouter, OpenRouterError } from "../src/openrouter.js";

describe("callOpenRouter", () => {
  it("returns content, citations, and usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "x-ai/grok-4.20",
        choices: [{ message: { content: "Answer" } }],
        citations: ["https://example.com"],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 },
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
      },
      fetchMock,
    );

    expect(result.content).toBe("Answer");
    expect(result.sources).toEqual([{ url: "https://example.com" }]);
    expect(result.usage.calls[0]).toMatchObject({ costUsd: 0.001, promptTokens: 10, completionTokens: 5 });
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

  it("maps network failures to retryable OpenRouter errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("Network error talking to OpenRouter. Please retry.");
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

  it("maps retryable provider failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Provider overloaded",
    });

    await expect(
      callOpenRouter(
        { apiKey: "test-openrouter-key", appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock,
      ),
    ).rejects.toThrow("OpenRouter provider error (503): Provider overloaded. Please retry.");
  });
});
