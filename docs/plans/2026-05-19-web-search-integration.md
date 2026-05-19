# OpenRouter Web Search / Web Fetch Integration Plan

> **For agentic workers:** Implement phase-by-phase. Use checkbox (`- [ ]`) syntax for tracking. Validate Phase 0 before building Phase 1.

**Goal:** Add OpenRouter server tools (`openrouter:web_search`, `openrouter:web_fetch`) so Grok modes can ground answers without switching to Perplexity Sonar, while keeping existing `research` / `multi` behavior intact.

**References:**
- [Agentic Web Tools announcement](https://openrouter.ai/announcements/agentic-web-tools)
- [Server tools overview](https://openrouter.ai/docs/guides/features/server-tools)
- [Web search server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search)
- [Web fetch server tool](https://openrouter.ai/docs/guides/features/server-tools/web-fetch)
- [Deprecated web plugin migration](https://openrouter.ai/docs/guides/features/web-search)

**Architecture today:** Single-shot `POST /v1/chat/completions` with `model` + `messages` only (`src/openrouter.ts`). Grounding for `research` / `multi` uses Sonar (`perplexity/*`) and `citations[]` on the response.

---

## Key API fact (simplifies implementation)

**Server tools run entirely on OpenRouter** — no client-side tool loop. Add `tools: [{ type: "openrouter:web_search" }, ...]` to one request; OpenRouter runs 0–N searches/fetches server-side and returns the final assistant message.

grok-cli only needs to:

1. Attach the correct `tools` array
2. Parse final `content`, `annotations` / `citations`, and `usage.server_tool_use`
3. Surface that in existing formatters

Requires a **tool-calling** model (Grok 4.x on OpenRouter — validate in Phase 0 spike).

---

## Goals

| Goal | Detail |
|------|--------|
| Grounded Grok answers | `expert` / `fast` / `auto` can search without switching to Sonar |
| Agent-friendly | `--json` includes `sources` from `url_citation` annotations; usage shows `web_search_requests` |
| Cost control | Defaults: `max_results`, `max_total_results`, predictable engine |
| Coexist with Sonar | `deepresearch` uses Sonar deep only; Grok single-call modes get web **by default**; `multi` web-off |
| Agent ergonomics | No `--web` on every command; opt out with `--no-web` when search isn’t needed |

## Non-goals (v1 of this feature)

- [ ] Client-side tool loop (user-defined `function` tools)
- [ ] Replacing Sonar in `research` by default
- [ ] `:online` model suffix or deprecated `plugins: [{ id: "web" }]`
- [ ] `openrouter:datetime` / image generation (unless trivial later)

---

## Product decisions

### Web search default: on for single-call Grok only

**Default-on** for `auto` / `fast` / `expert` so agents do not pass an enable flag every time. **Off** for `deepresearch`, `multi`, and deprecated `research` — avoids double grounding and runaway cost.

```bash
grok "SQLite vs Postgres for a desktop app"     # Grok + web search; stderr hint
grok --no-web expert "Explain RAII in C++"    # CLI flag wins over config
grok deepresearch "Latest Node.js LTS"        # Sonar deep — no OR web tools
grok multi "Redis vs Memcached for sessions"  # Sonar + Grok ensemble; no OR web on Grok legs
grok --web "..."                              # deprecated: no-op + stderr warning
```

### Mode: `deepresearch` (canonical deep research)

Rename the mental model: **`deepresearch`** is the Sonar deep-research pipeline (`deepResearch` model alias). The old `research` token remains as a **deprecated alias** (stderr warning → same routing).

| Mode | Model alias | OpenRouter web tools |
|------|-------------|----------------------|
| `auto` / `expert` / `fast` | `expert` / `fast` | **On** (unless disabled) |
| `deepresearch` | `deepResearch` | **Off** (Sonar native search) |
| `research` | same as `deepresearch` | **Off** (deprecated alias) |
| `multi` | `research` on Sonar pass; `expert` on Grok legs | **Off** on all legs |

### Flags and precedence

```text
webEnabled =
  modeAllowsWeb(mode)           # auto | fast | expert only
  && config.web.search.enabled  # global default true
  && !cli.noWeb                 # local CLI flag wins
```

| Flag | Effect |
|------|--------|
| *(default)* | `openrouter:web_search` on `auto` / `fast` / `expert` |
| `--no-web` | Force off for this run (overrides config) |
| `--web` | **Deprecated.** No-op; stderr: use default or `--no-web` |
| `--web-engine`, … | Tune search when `webEnabled` |
| `--web-fetch` | **[Phase 3]** Fetch tool on Grok modes when `webEnabled` |

**Run hint** (stderr, once per run when `webEnabled`):

```text
hint: OpenRouter web search is enabled (--no-web to disable)
```

### Sources and annotation parsing (simplified scope)

Only **single-call Grok paths with `webEnabled`** need `message.annotations` → `sources[]` parsing.

| Path | Sources from |
|------|----------------|
| `auto` / `fast` / `expert` + web | `url_citation` annotations (+ optional `citations[]`) |
| `deepresearch` / `research` | Sonar / existing `citations[]` + inline refs (no OR tools) |
| `multi` | Sonar pass citations + synthesis content (no OR web annotations on Grok legs) |

Append `## Sources` in Markdown when annotations exist and the model omitted the section.

### Spike: tools attached, search unused

Case: `grok-4.20` + `web_search` tool, prompt “2+2, no search”.

| Metric | No tools | Tools, 0 searches | Tools, 5 searches |
|--------|----------|-------------------|-----------------|
| `web_search_requests` | — | 0 / absent | 5 |
| `prompt_tokens` | ~143 | **~1,782** | ~16,511 |
| `cost` | ~$0.0002 | **~$0.0008** | ~$0.04 |

**Implication:** Default-on still adds token overhead when the model skips search. The run hint + footer `Web searches: 0` (or omit when 0) sets expectations; `--no-web` remains important for cheap static prompts.

### Default engine

Config default: `engine: "auto"`. Document `--web-engine exa` for consistent cross-provider behavior.

---

## Phased implementation

### Phase 0 — Spike (0.5 day)

- [x] **Step 1:** One live request: `x-ai/grok-4.20` + `tools: [{ type: "openrouter:web_search" }]`
- [x] **Step 2:** Confirm single HTTP round-trip, `annotations`, `usage.server_tool_use.web_search_requests`
- [x] **Step 3:** Confirm Grok error shape if tools unsupported
- [x] **Step 4:** Compare output quality vs `grok research` (Sonar) on 2–3 README prompts
- [x] **Step 5:** Tools attached, model skips search (`2+2` prompt) — ~1.8k prompt tokens, ~4× baseline cost, 0 searches

**Exit criteria:** **GO** — see [spike results](./2026-05-19-web-search-spike-results.md). Re-run: `node scripts/spike-phase0-web-tools.mjs`.

---

### Phase 1 — Core plumbing (1–2 days)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/defaults.ts`
- Modify: `src/config.ts`
- Modify: `src/args.ts`
- Modify: `src/openrouter.ts`
- Modify: `src/modes.ts`
- Modify: `src/formatters.ts`
- Modify: `src/cost.ts` (if needed)
- Create/Modify: `test/openrouter.test.ts`, `test/args.test.ts`, `test/modes.test.ts`

- [x] **Step 1: Extend types**

`OpenRouterTool` union: `openrouter:web_search` | `openrouter:web_fetch` with typed `parameters`.

Extend `OpenRouterRequest` with `tools?: OpenRouterTool[]`.

Extend message/response types: `annotations?: UrlCitation[]`.

Extend usage: `serverToolUse?: { web_search_requests?: number; web_fetch_requests?: number }`.

- [x] **Step 2: Config defaults**

```json
{
  "web": {
    "search": {
      "enabled": true,
      "engine": "auto",
      "max_results": 5,
      "max_total_results": 10
    },
    "fetch": {
      "enabled": false,
      "engine": "auto",
      "max_content_tokens": 50000
    }
  }
}
```

- [x] **Step 3: Modes + CLI (`src/args.ts`, `src/modes.ts`, `src/types.ts`)**

- Add mode `deepresearch`; map deprecated `research` → `deepresearch` with stderr warning
- `deepresearch` uses `deepResearch` model alias (not `research` alias)
- `modeAllowsWeb`: only `auto` | `fast` | `expert`
- `--no-web` sets `noWeb: true` (precedence over config)
- `--web` deprecated: no-op + stderr warning
- `--web-engine`, `--web-max-results`, `--web-max-total-results`, domain flags
- Resolve: `webEnabled = modeAllowsWeb(mode) && config.web.search.enabled && !noWeb`

- [x] **Step 4: OpenRouter client (`src/openrouter.ts`)**

- `buildTools(call)` when `call.webEnabled`
- Never attach tools for `perplexity/*`
- `extractSources`: `citations[]` + `message.annotations` (`url_citation`) → `Source[]`
- Map `usage.server_tool_use` into usage summary

- [x] **Step 5: CLI hint (`src/cli.ts`)**

- If `webEnabled`, print once to stderr: `hint: OpenRouter web search is enabled (--no-web to disable)`

- [x] **Step 6: Formatters**

- Footer: `| Web searches: N` when `web_search_requests > 0`
- JSON: `sources`, `usage.server_tool_use`, `web.search_enabled`

- [x] **Step 7: Unit tests (mocked `fetch`)**

- Tools on for `expert` by default; off for `deepresearch` / `multi` / `--no-web`
- `--no-web` overrides `config.web.search.enabled: true`
- `--web` deprecated warning
- `research` positional → `deepresearch` + warning
- Annotation → `sources[]` (Grok + web path only)

---

### Phase 2 — Prompts & UX polish (0.5–1 day)

**Files:**
- Modify: `src/prompts.ts`
- Modify: `src/args.ts` (`HELP_TEXT`)
- Modify: `README.md`

- [x] **Step 1:** When `webEnabled`, extend system prompt: search for time-sensitive facts; cite sources
- [x] **Step 2:** README `[planned]` tags (done); remove tags when Phase 1 ships
- [x] **Step 3:** `HELP_TEXT`: `deepresearch`, deprecated `research`, `--no-web`, deprecated `--web`

---

### Phase 3 — `web_fetch` (0.5–1 day)

**Files:**
- Modify: `src/openrouter.ts`, `src/args.ts`

- [x] **Step 1:** `--web-fetch` adds `openrouter:web_fetch` when `webEnabled` (Grok modes only)
- [x] **Step 2:** Verify `web_fetch` usage field in API response
- [x] **Step 3:** Do **not** enable web on `multi` Grok legs (unchanged from product decision)

---

### Phase 4 — Hardening (ongoing)

- [x] Model capability guard: clear error when model doesn’t support tools
- [x] README: Exa/Parallel search pricing notes
- [x] Track beta API drift against OpenRouter server-tools docs (see README link + plan references)
- [x] Resolve `--web` + `--json` + `json_object` compatibility (Phase 0 open question)

---

## Module change map

| File | Changes |
|------|---------|
| `src/args.ts` | Web flags, `CliOptions.web` |
| `src/config.ts` | Load/merge `web` config; resolve CLI overrides |
| `src/types.ts` | Tools, annotations, usage |
| `src/openrouter.ts` | `tools` on body, source extraction, usage |
| `src/modes.ts` | Pass web options; multi branch |
| `src/prompts.ts` | Web-aware system prompts |
| `src/formatters.ts` | Footer + JSON fields |
| `src/cost.ts` | Optional search-cost line item |
| `test/*.ts` | Unit tests per phase |
| `README.md` | When to use `--web` vs `research` |

---

## Response contract (agents)

Extend `--json` (backward compatible):

```json
{
  "mode": "expert",
  "web": { "search_enabled": true, "fetch_enabled": false },
  "sources": [{ "url": "...", "title": "..." }],
  "usage": {
    "cost_usd": 0.01,
    "server_tool_use": { "web_search_requests": 2 }
  }
}
```

Markdown footer example:

```text
Cost: $0.012 | Models: x-ai/grok-4.20 | Tokens: 2.1k in / 800 out | Web searches: 2
```

---

## Testing plan

| Layer | Cases |
|-------|--------|
| Unit | Args parsing; tools on by default for Grok; `--no-web` off; `research` never gets tools; annotation parsing |
| Integration (mock) | Full `runMode` with fake OR response including annotations |
| Live smoke | `grok "Node LTS 2026"` (web on); `grok --no-web ...`; `grok research ...` (no tools); `grok multi ...` |
| Eval (manual) | Same prompt: `research` vs default `expert` — citation quality, latency, cost |

Manual smoke commands:

```bash
grok "Latest stable Node.js LTS version as of 2026"
grok --mode expert --json "Compare Bun vs Node for a CLI tool"
grok --no-web fast "Explain what a mutex is"
grok deepresearch "Latest stable Node.js LTS version as of 2026"   # Sonar deep, no OR web tools
grok multi "Redis or Memcached for session cache only"
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Beta API changes | Thin wrapper; fixture tests from recorded responses |
| 0 vs N searches → variable cost | Default `max_total_results`; document in README |
| Grok doesn’t call search when needed | Stronger system prompt; user can still use `research` |
| `multi` cost explosion | Web **off** on all `multi` legs; Sonar-only research pass |
| Tools attached, 0 searches | ~1.8k prompt tokens; stderr hint + recommend `--no-web` for static prompts |
| `json_object` + tools together | **Compatible** (Phase 0) |
| Agents pass `--web` | Deprecated no-op + warning; document `deepresearch` vs default Grok |

---

## Suggested PR order

1. **PR1:** Types + `openrouter.ts` tools + annotation sources + tests (dev-only `web: true` if needed)
2. **PR2:** default web + `--no-web` / config / README / formatters
3. **PR3:** `--web-fetch` + domain filters
4. **PR4:** polish (deduped warnings, Perplexity guard, docs)

---

## Open questions (resolve in Phase 0)

- [x] Does `x-ai/grok-4.20` + `response_format: json_object` work with server tools? **Yes** — allow `--web` + `--json`.
- [x] Should `research` + enable-web flags **warn** or **error**? **`research` ignores web; error only if tools would be sent to Sonar** (e.g. future misconfiguration). `--no-web` on `research` is a no-op.
- [x] Default `max_total_results` for CLI: 10 vs 15 vs 20? (Spike: model ran 5–6 searches with `max_total_results: 10`; default **10**.)
- [x] Show `web_search_requests` in footer when `cost_usd` is unavailable? (**Yes** — recommended.)
- [x] `web_fetch` usage field name — `web_fetch_requests` (parsed when API returns it)

---

## Recommendation

Ship **Phase 0 + Phase 1** first: web **default on** for `auto`/`fast`/`expert` only; `--no-web` (local) overrides config; `deepresearch` + `multi` without OR web tools; deprecated `--web` / `research` aliases; stderr hint + `sources` from annotations on Grok path only.
