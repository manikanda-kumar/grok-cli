import { describe, expect, it, vi } from "vitest";
import { callOpencodeGo, extractSources, OpencodeGoError } from "../src/opencode-go.js";

const config = { apiKey: "ocg-key", baseUrl: "https://opencode.ai/zen/go/v1", sessionId: "vote-cli-ok1" };

const response = (over: Record<string, unknown> = {}) => ({
  id: "r_1",
  object: "response",
  model: "grok-4.6",
  status: "completed",
  output: [
    {
      id: "rs_1",
      type: "reasoning",
      status: "completed",
      summary: [{ type: "summary_text", text: "" }],
    },
    {
      id: "msg_1",
      type: "message",
      status: "completed",
      role: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "output_text", text: "Canberra", annotations: [] }],
      },
    },
  ],
  usage: { input_tokens: 204, output_tokens: 6, total_tokens: 210 },
  ...over,
});

describe("callOpencodeGo", () => {
  it("shapes body and parses the response into a PipelineResult", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response(),
    });

    const result = await callOpencodeGo(
      config,
      { role: "expert", model: "grok-4.6", messages: [{ role: "user", content: "Capital of Australia?" }] },
      fetchMock,
    );
    expect(result.content).toBe("Canberra");
    expect(result.usage.totalPromptTokens).toBe(204);
    expect(result.usage.totalCompletionTokens).toBe(6);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.model).toBe("grok-4.6");
    expect(body.max_output_tokens).toBeUndefined();
    expect((init?.headers as Record<string, string>)["x-opencode-session"]).toBe("vote-cli-ok1");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toContain("grok-cli");
  });

  it("omits session header when absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response(),
    });
    await callOpencodeGo(
      { apiKey: "k" },
      { role: "expert", model: "grok-4.6", messages: [{ role: "user", content: "hi" }] },
      fetchMock,
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.headers as Record<string, string>)["x-opencode-session"]).toBeUndefined();
  });

  it("sends json_object via text.format when json is true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response() });
    await callOpencodeGo(
      config,
      { role: "expert", model: "grok-4.6", messages: [{ role: "user", content: "hi" }], json: true },
      fetchMock,
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.text).toEqual({ format: { type: "json_object" } });
  });

  it("maps model-unavailable failures to a friendly error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "",          // empty
    });
    await expect(
      callOpencodeGo(config, { role: "expert", model: "grok-4.5", messages: [{ role: "user", content: "hi" }] }, fetchMock),
    ).rejects.toMatchObject({ message: /Model is unavailable|model unavailable/, status: 400 });
  });

  it("throws a helpful error for missing API keys", async () => {
    await expect(
      callOpencodeGo(
        {},
        { role: "expert", model: "grok-4.6", messages: [{ role: "user", content: "hi" }] },
        vi.fn(),
      ),
    ).rejects.toThrow(/OPENCODE_GO_API_KEY/);
  });

  it("retries on 429 then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" })
      .mockResolvedValueOnce({ ok: true, json: async () => response() });
    const promise = callOpencodeGo(
      config,
      { role: "expert", model: "grok-4.6", messages: [{ role: "user", content: "hi" }] },
      fetchMock,
    );
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.content).toBe("Canberra");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("extractSources", () => {
  it("extracts url_citation annotations from output parts", () => {
    const resp = response({
      citations: ["https://a.example"],
      output: [
        {
          type: "message",
          message: {
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "x",
                annotations: [
                  {
                    type: "url_citation",
                    start_index: 0,
                    end_index: 1,
                    url_citation: { url: "https://b.example", title: "B" },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(extractSources(resp)).toEqual([
      { url: "https://a.example" },
      { url: "https://b.example", title: "B" },
    ]);
  });

  it("returns empty when there are no citations", () => {
    expect(extractSources(response())).toEqual([]);
  });
});

describe("OpencodeGoError", () => {
  it("carries a status", () => {
    const err = new OpencodeGoError("boom", 503);
    expect(err.status).toBe(503);
    expect(err.name).toBe("OpencodeGoError");
  });
});
