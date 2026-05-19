# Phase 0 Spike Results — OpenRouter Web Tools

**Date:** 2026-05-19  
**Script:** `scripts/spike-phase0-web-tools.mjs`  
**Prompt:** `What is the current Node.js LTS version as of 2026? One sentence, cite a source.`

## Verdict: **GO** for Phase 1

Grok 4.20 + `openrouter:web_search` works in a **single** `chat/completions` request. Sources arrive as `message.annotations` (`url_citation`), not `citations[]`. Sonar must not receive server tools (404). `json_object` + web search is compatible.

---

## Step 1–2: Grok + `openrouter:web_search`

| Check | Result |
|-------|--------|
| HTTP round-trips | **1** per request (~0.9–1.0s) |
| `finish_reason` | `stop` |
| Final `content` | Grounded answer (Node.js 24 LTS) |
| `usage.server_tool_use` | `{ "web_search_requests": 5 }` (model ran multiple searches server-side in one request) |
| Citations | **`annotations`**, not top-level `citations[]` (count: 0) |
| Annotation shape | `{ type: "url_citation", url_citation: { url, title, start_index, end_index } }` |

**Implication for Phase 1:** Parse `choices[0].message.annotations` in addition to `json.citations`. Existing Sonar path may already return annotations (see Sonar baseline below).

**Cost note:** Web search inflated prompt tokens (~16.5k in vs ~143 baseline). Footer must show `web_search_requests` so agents understand cost drivers.

---

## Step 2b: `json_object` + web search

| Check | Result |
|-------|--------|
| Combined request | **Works** (200) |
| Output | Valid JSON: `{"answer":"...","source_url":"..."}` |
| `web_search_requests` | 6 |

**Open question resolved:** Allow `--web` + `--json` together; no need to disable `response_format`.

---

## Step 3: Tools unsupported / wrong model

| Case | Status | Error |
|------|--------|-------|
| `perplexity/sonar-pro-search` + `tools: [web_search]` | **404** | `No endpoints found that support tool use` |

**Implication:** Never attach server tools to Sonar. If user passes `grok research --web`, **warn or error** before calling API.

---

## Step 3b: Grok baseline (no tools)

| Check | Result |
|-------|--------|
| Answer | **Wrong** — claimed Node.js **v22** LTS (stale training) |
| `server_tool_use` | absent |
| Cost | ~$0.0002, ~143 prompt tokens |

Demonstrates value of `--web` on expert path for time-sensitive facts.

---

## Step 3c: Grok + `openrouter:web_fetch`

| Check | Result |
|-------|--------|
| HTTP round-trips | **1** (~10s) |
| `server_tool_use` | **Not present** in response (no `web_fetch_requests` field observed) |
| Answer | Plausible but **wrong type string** (`"web_search"` vs actual `"openrouter:web_search"`) |

**Implication:** Ship `web_fetch` in Phase 3 with manual verification; do not rely on fetch-only for critical facts without citations.

---

## Step 4: Compare to `grok research` (Sonar)

| Path | Latency | Cost (OR usage) | Answer | Citations |
|------|---------|-------------------|--------|-----------|
| `grok research` (CLI) | ~7s | $0.011, 90 in / 49 out | Node 24.x LTS | Inline `[1][7]` in text |
| Spike Sonar baseline | ~2.9s | $0.0106, 35 in / 33 out | Node 24.x (Krypton) | 10× `url_citation` annotations |
| Spike Grok + web_search | ~1.0s | $0.042, 16.5k in / 300 out | Node 24 LTS | 2× `url_citation` annotations |

**Quality:** Both grounded paths agree on Node 24. Sonar is cheaper and lighter on tokens for this prompt; Grok+web is faster wall-clock but much higher token/cost due to search context injection.

**Recommendation:** Enable OpenRouter web search **by default** on single-call Grok modes only (`--no-web` to opt out). Use canonical mode **`deepresearch`** (deprecated alias `research`) for Sonar deep research. Keep **`multi`** web-off on all legs. Print stderr hint when web is on.

---

## Step 5: Tools attached, search unused

Prompt: `What is 2+2? Reply with only the number, no search.`  
Tools: `openrouter:web_search` on `grok-4.20`.

| Metric | No tools baseline | Tools, unused | Tools, used (Node LTS prompt) |
|--------|-------------------|---------------|-------------------------------|
| `web_search_requests` | — | absent / 0 | 5 |
| `prompt_tokens` | 143 | **1,782** | 16,511 |
| `cost` | $0.00021 | **$0.00076** | $0.042 |
| `annotations` | 0 | 0 | 2 |

**Implication:** Default-on adds ~12× prompt tokens vs bare Grok even when the model does not search. Use `--no-web` for static/cheap prompts; show run hint so users expect possible overhead.

---

## Implementation checklist (from spike)

- [x] Single-request server tool execution (no client loop)
- [x] Parse `message.annotations` for sources
- [x] Surface `usage.server_tool_use.web_search_requests`
- [x] Block/warn tools on `perplexity/*`
- [x] `json_object` + tools compatible
- [x] Confirm `web_fetch` usage field name in Phase 3 (`usage.server_tool_use.web_fetch_requests`)
- [ ] Default `max_total_results` to cap search count (spike used 10; model still ran 5–6 searches)

---

## Raw spike command

```bash
OPENROUTER_API_KEY=... node scripts/spike-phase0-web-tools.mjs
```
