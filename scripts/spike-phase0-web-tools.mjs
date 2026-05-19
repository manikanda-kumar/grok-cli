#!/usr/bin/env node
/**
 * Phase 0 spike: OpenRouter server tools with Grok vs Sonar.
 * Usage: OPENROUTER_API_KEY=... node scripts/spike-phase0-web-tools.mjs
 */

const API = "https://openrouter.ai/api/v1/chat/completions";
const KEY = process.env.OPENROUTER_API_KEY;
const MODELS = {
  expert: "x-ai/grok-4.20",
  research: "perplexity/sonar-pro-search",
};

const PROMPT = "What is the current Node.js LTS version as of 2026? One sentence, cite a source.";

if (!KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

async function chat(label, body) {
  const started = Date.now();
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/local/grok-cli",
      "X-Title": "grok-cli-spike",
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - started;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { label, ok: res.ok, status: res.status, elapsedMs, json, raw: text.slice(0, 2000) };
}

function summarize(result) {
  const { label, ok, status, elapsedMs, json } = result;
  const choice = json?.choices?.[0];
  const message = choice?.message;
  const usage = json?.usage;
  const annotations = message?.annotations ?? [];
  const citations = json?.citations ?? [];
  const serverToolUse = usage?.server_tool_use;

  return {
    label,
    ok,
    status,
    elapsedMs,
    model: json?.model,
    finishReason: choice?.finish_reason,
    contentPreview: typeof message?.content === "string" ? message.content.slice(0, 400) : message?.content,
    annotationCount: annotations.length,
    annotationsSample: annotations.slice(0, 2),
    citationCount: citations.length,
    citationsSample: citations.slice(0, 3),
    serverToolUse,
    usage: usage
      ? {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          cost: usage.cost,
        }
      : undefined,
    error: json?.error,
  };
}

const cases = [
  {
    label: "grok-expert-web-search",
    body: {
      model: MODELS.expert,
      messages: [{ role: "user", content: PROMPT }],
      tools: [{ type: "openrouter:web_search", parameters: { max_results: 3, max_total_results: 10 } }],
    },
  },
  {
    label: "grok-expert-web-search-json-object",
    body: {
      model: MODELS.expert,
      messages: [
        {
          role: "system",
          content:
            'Return only JSON: {"answer":"...","source_url":"..."}. No markdown.',
        },
        { role: "user", content: PROMPT },
      ],
      tools: [{ type: "openrouter:web_search" }],
      response_format: { type: "json_object" },
    },
  },
  {
    label: "grok-expert-no-tools-baseline",
    body: {
      model: MODELS.expert,
      messages: [{ role: "user", content: PROMPT }],
    },
  },
  {
    label: "grok-expert-tools-attached-unused",
    body: {
      model: MODELS.expert,
      messages: [{ role: "user", content: "What is 2+2? Reply with only the number, no search." }],
      tools: [{ type: "openrouter:web_search", parameters: { max_results: 3, max_total_results: 5 } }],
    },
  },
  {
    label: "grok-expert-web-fetch",
    body: {
      model: MODELS.expert,
      messages: [
        {
          role: "user",
          content: "In one sentence, what does OpenRouter document as the type string for web search server tools?",
        },
      ],
      tools: [
        {
          type: "openrouter:web_fetch",
          parameters: {
            max_content_tokens: 8000,
            allowed_domains: ["openrouter.ai"],
          },
        },
      ],
    },
  },
  {
    label: "sonar-with-web-search-tool",
    body: {
      model: MODELS.research,
      messages: [{ role: "user", content: PROMPT }],
      tools: [{ type: "openrouter:web_search" }],
    },
  },
  {
    label: "sonar-baseline-research",
    body: {
      model: MODELS.research,
      messages: [
        {
          role: "system",
          content: "Ground every factual claim in current sources. Include citations when available.",
        },
        { role: "user", content: PROMPT },
      ],
    },
  },
];

const results = [];
for (const { label, body } of cases) {
  console.error(`Running: ${label}...`);
  const result = await chat(label, body);
  results.push(summarize(result));
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(JSON.stringify({ prompt: PROMPT, results }, null, 2));
