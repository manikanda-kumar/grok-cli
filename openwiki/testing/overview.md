---
type: testing
title: Testing strategy & validation invariants
description: How the Vitest suite is organized per module and what invariants it pins — web tools per model, two-pass --json/--schema + web dispatch, --max-cost budget abort sequencing, JSON parse tolerances, and the --json error contract — plus the injection patterns (ModeCaller fakes, fetchImpl, spawnImpl, spawnSync) and guidance for validating changes narrowly.
tags: [testing, vitest, invariants, mock-patterns, validation, exit-code-contract]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-29T08:01:17.972Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-d5eb14827168c0507b57a726
    resource: repo://src/args.ts
  - id: openwiki-source-e37f96672750982008da2aeb
    resource: repo://src/bookmarks.ts
  - id: openwiki-source-d2f650c01f560a60ae9115b9
    resource: repo://src/cli.ts
  - id: openwiki-source-2b68006c6421e01c95988dcc
    resource: repo://src/config.ts
  - id: openwiki-source-e425c4159594728f0491dc9f
    resource: repo://src/defaults.ts
  - id: openwiki-source-75e054fe46c678f8d07f2214
    resource: repo://src/modes.ts
  - id: openwiki-source-9812fbeb25ba64930cd7339b
    resource: repo://src/openrouter.ts
  - id: openwiki-source-b2cc69df2fd4ff87a1ac88eb
    resource: repo://src/retrieval.ts
  - id: openwiki-source-a631dd81b06cba4e8fe11eac
    resource: repo://src/x-signal.ts
  - id: openwiki-source-14fa96bf66705c0e4b025832
    resource: repo://test/args.test.ts
  - id: openwiki-source-4500eabb2c61af1140935469
    resource: repo://test/bookmarks.test.ts
  - id: openwiki-source-1c0a71c46a0594c7a43890a4
    resource: repo://test/cli.test.ts
  - id: openwiki-source-a5d629e92170169ba9cd7d0c
    resource: repo://test/config.test.ts
  - id: openwiki-source-353c174bc6cb3fd8d0af9849
    resource: repo://test/modes.test.ts
  - id: openwiki-source-0a435ab9fbce45eb264c732c
    resource: repo://test/openrouter.test.ts
  - id: openwiki-source-15ac3c6c7b1603f832fea136
    resource: repo://test/retrieval.test.ts
  - id: openwiki-source-369b91cb61f8f1724ef1d17c
    resource: repo://test/x-signal.test.ts
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
generated: { by: "openwiki/0.4.3", at: "2026-08-29T08:01:17.972Z" }
---

# Testing strategy & validation invariants

`grok-cli` is a zero-dependency TypeScript CLI (Node ≥ 20, ESM). Its test suite is the single Vitest
run `pnpm test` (`vitest run`, per `package.json`), with no `vitest.config.*` file — tests import raw
`src/*.ts` modules directly, which `vitest`/`tsx` handle through the same NodeNext/ESM resolution the
dev checkout uses. `pnpm typecheck` runs `tsc --noEmit` over `src/**/*.ts` and `test/**/*.ts` under a
strict config (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), so test fixtures
must respect optional-property omission (spread-with-`...` rather than `undefined` assignments) and
tests are typechecked as strictly as production code.

Source code and tests are authoritative when the wiki's brief givens drift. Prefer the
narrowest quiet validation that proves the changed behavior, and preserve complete
failure output — unit tests assert exact dispatch/parse/error shapes rather than running
the whole CLI, and failures carry the full expected message rather than a trimmed
substring where the message is the contract (see [errors](#error-messages-are-contract)).

## Test layout and what each file pins

| Test file | Module under test | Invariants pinned |
|---|---|---|
| `test/args.test.ts` | `src/args.ts` `parseArgs`/`wantsJson` | Parse shapes per flag family, defaults (`mode: "auto"`, `profile: "quality"`, `outputStyle: "brief"`, `web`/`x`/`bookmarks` empty shapes), positional subcommand modes, `--` terminator, validation errors (`Missing prompt`, `Unknown option: --jsno`, `Invalid value for --max-cost`, `Invalid --output style`, `Invalid --web-provider`, `Invalid --x-network`), `wantsJson` intent pre-scan |
| `test/config.test.ts` | `src/config.ts` + `src/defaults.ts` | Default model alias tables, config-file merge over defaults, env key override, `resolveModel` aliases, `modeAllowsWeb`, web resolution precedence (`--no-web` > config, retrieve forces search but not fetch, `--web-fetch` re-enables), validation conflicts (allow+block lists, `--web-fetch` with `--no-web`), `assertWebToolsCompatible` (Perplexity expert override rejected), `resolveCliOptions` explicit-vs-default precedence |
| `test/modes.test.ts` | `src/modes.ts` `runMode`/`parseDecisionAnswer` + connected `config`/`prompts` behavior | Dispatch counts per branch, model routing, deprecation warnings, **two-pass `--json`+web and `--schema`+web** (call count, roles, tool/web attachment per pass), single-pass `--json` when web off, **budget abort sequencing** under `--max-cost`, multi role-failure semantics, retrieve activation (positional `retrieve`, `--retrieve`, `--output results|both`), ignored-retrieve warnings on non-web modes, schema overrides, `parseDecisionAnswer` tolerances |
| `test/openrouter.test.ts` | `src/openrouter.ts` `buildTools`/`extractSources`/`callOpenRouter` | Tool mapping per model (Grok gets `openrouter:web_search`/`web_fetch`; Perplexity gets none), domain mapping (`excluded_domains` vs `blocked_domains`), `json_object` gating, 3-attempt retry (network failure, 429/5xx, Retry-After wins over backoff), status→error mapping (401/402/404/tool-use/model-unavailable), source extraction from citations+annotations, `server_tool_use` mapping |
| `test/retrieval.test.ts` | `src/retrieval.ts` (+ `extractSources` re-export) | `parseRetrieveContent` tolerance (invalid JSON/non-array → empty results, never throws; skips URL-less entries; preserves `raw_content`), `resultsFromSources` descending citation-order scores in (0,1], `mergeRetrieveResults` keeps model snippets and adds citation-only sources, scores every unscored result |
| `test/x-signal.test.ts` | `src/x-signal.ts` | `buildWhathappenedPrompt` marker block (`## X_SIGNAL_MARKDOWN` / `## END_X_SIGNAL`), `/whathappened` topic line, network mode encoding, `parseXSignalText` block extraction vs full-text fallback, `extractReportPath` free-standing HTML path regex |
| `test/bookmarks.test.ts` | `src/bookmarks.ts` | Env key candidate priority (`TWEETSMASH_API_KEY` → `TWEETSMASH_TOKEN`), `mapPost` key field mapping, `relatedTerms` derivation, `searchBookmarks` skip semantics (no key), keyword+semantic query params, related-pass routing (author vs q), `formatBookmarksMarkdown` rendering |
| `test/cost.test.ts` | `src/cost.ts` | `addUsageCall` accumulation, `costUsd` defined only when every call reports a cost, `formatCost` (`$0.0421` / `unavailable`) |
| `test/formatters.test.ts` | `src/formatters.ts` + `parseDecisionAnswer`-shaped results | Markdown brief with Sources/footer, stable JSON payload key shapes (snake_case, `null` cost fields, `answer`/`search_results`/`schema_result`/`x_signal` presence rules), retrieve markdown with scores, raw with footer |
| `test/prompts.test.ts` | `src/prompts.ts` | Web-instruction presence by web flag, `--json` prompt (`Return only a JSON object`), X/bookmark injection points, retrieve JSON contract (results/title/url/content), schema messages, `withXSignal` passthrough |
| `test/cli.test.ts` | `src/cli.ts` end-to-end | The only test using real `spawnSync`: `pnpm tsx src/cli.ts --json` with no prompt exits 1 and prints `{"error":{"message":"Missing prompt"}}` on stderr |

## Injection patterns

The suite never performs real model calls, X-agent spawns, or TweetSmash requests. Each boundary is
injected at the narrowest seam the module already exposes, and only `cli.test.ts` shells out to the
real binary:

- **`ModeCaller` fake results for `runMode` tests** (`test/modes.test.ts`). `runMode` receives its
  model-call function as an argument (`type ModeCaller = (call: ModeCall) => Promise<PipelineResult>`).
  Tests pass `vi.fn()` implementations that synthesize `PipelineResult` objects via `fakeResult(role,
  model, content)` + `addUsageCall(emptyUsage(), {...})`, so per-call cost is controlled exactly —
  this is what makes the budget-sequencing tests deterministic ($0.001 per call, assertions on exactly
  which roles were dispatched). `fakeRetrieveResult` returns a Tavily-style `results[]` payload to
  exercise retrieve parsing. Call-count, `role`, `model`, `messages`, `json`, and `web` assertions are
  read off `caller.mock.calls`.
- **`fetchImpl` for `bookmarks.test.ts` and `openrouter.test.ts`.** Both `callOpenRouter` and
  `searchBookmarks` accept a fetch implementation parameter that defaults to global `fetch`. Tests
  assert on the URL/request body (`q=agent+skills`, `author=`, `tools`, `response_format`) and return
  canned `Response` objects — including `ok: false` fixtures with `text()` bodies and `Retry-After`
  headers for the error-mapping and retry tests. `openrouter.test.ts` uses `vi.useFakeTimers()` +
  `vi.runAllTimersAsync()`/`advanceTimersByTimeAsync` to advance the real `setTimeout`-based backoff.
- **`spawnImpl` for `x-signal`.** `fetchXSignal` takes `{ spawnImpl?, env? }` deps so tests can drive
  the child-process boundary without a `grok` binary; `test/x-signal.test.ts` pins the prompt
  contract and parsing fallbacks rather than the spawn itself.
- **Real `spawnSync` only in `cli.test.ts`.** Because the exit-code + stderr-JSON contract lives at
  the process boundary, the end-to-end test executes `pnpm tsx src/cli.ts --json` through
  `node:child_process` `spawnSync` and asserts `result.status === 1` plus `JSON.parse(result.stderr)`.
  This is the suite's single true subprocess e2e, and the only test that does not mock I/O.

## Core invariants the suite pins

### Web tools per model

`buildTools(model, web)` returns `undefined` (no tools) for `perplexity/*` models and whenever both
search and fetch are disabled; Grok models get `openrouter:web_search` (parameters `max_results`,
`max_total_results`, `excluded_domains` from `blockedDomains`) and opt-in `openrouter:web_fetch`
(`blocked_domains`, `max_content_tokens`). `assertWebToolsCompatible` rejects a Perplexity expert
override with web enabled ("does not support OpenRouter server tools"). `modeAllowsWeb` is true only
for `auto`/`fast`/`expert`/`retrieve`, so `deepresearch`/`multi` never attach web tools and
`--retrieve`/`--output` on them degrades to a warning. Retrieve mode forces `searchEnabled: true`
even when config disables search, but never forces fetch (raw_content extraction is not wired).

### Two-pass dispatch for `--json`+web and `--schema`+web

When `--json` or `--schema` is combined with web search, the pipeline never sends one request with
both `json_object` and server tools: observed Grok behavior collapses constrained JSON to garbage
(e.g. a bare `-1.5e-05`) after heavy search context. The client enforces the rule mechanically —
`callOpenRouter` sets `response_format: {type: "json_object"}` only when `json && model supports it
&& !tools` — and `runMode` resolves the combination with exactly two calls (tested via
`toHaveBeenCalledTimes(2)`): a research pass with tools (`role: "expert"` or `"schema_research"`,
`json: false`, `temperature: 0.2`, web attached) then a tool-less format pass (`role: "json_format"`
or `"schema"`, `json: true`, `temperature: 0.1`, `web` undefined). `--json` without web stays a
single call with `json: true`; `--schema` without web stays a single call. The two-pass run adds the
warning `Used two-pass --json + web (research then JSON format) to avoid json_object+tools failures.`

### Budget abort sequencing under `--max-cost`

`withBudget` wraps the caller and tracks cumulative `costUsd`: a pre-check throws
`MaxCostExceededError` before dispatching if a prior stage already blew the cap, and a post-check
throws right after the call that crosses it (single-call test: one dispatch, reject with
`exceeded limit of $0.0005`). Under `multi`, the three analysis legs switch from
`Promise.allSettled` (parallel) to `runSequential`, which stops dispatch the moment a leg aborts —
the test asserts exactly `["research", "engineering"]` were dispatched at a $0.0015 cap with
$0.001/call and never lets the later legs overspend. `MaxCostExceededError` is rethrown as fatal
(even in multi), and `cli.ts` warns on stderr when `--max-cost` was set but no cost came back, so an
unenforced limit stays visible.

### JSON tolerances

- `parseDecisionAnswer` never throws: non-JSON content, non-object JSON (`"-1.5E-05"`), and empty
  decision objects become warnings with `answer` omitted (nominal fields are shaped via
  `stringValue`/`stringArray`, confidence coerced to `medium` unless exactly `low`/`high`).
- `parseRetrieveContent` returns `{ results: [] }` for invalid JSON or non-array `results`, skips
  entries without a `url`, and preserves `score`/`raw_content` when present.
- `mergeRetrieveResults`/`resultsFromSources` assign heuristic descending scores in (0,1] by
  citation order (`roundScore(1 - index/count)`, 3 decimals) and only fill scores for unscored
  entries.
- `callOpenRouter` maps invalid response JSON to `OpenRouterError("OpenRouter returned an invalid
  JSON response. Please retry.")` without retrying; `normalizeMessageContent` coerces non-string
  content (bare numbers under `json_object`) to text.

### Exit-code and stderr contract

`cli.test.ts` pins the agent-facing contract: parse failure with `--json` present exits 1 and writes
`{"error":{"message":"Missing prompt"}}` to **stderr** only. `formatError` emits this JSON shape
whenever `--json` was requested (detected by `wantsJson` pre-scan for parse-stage failures), the
plain `Error: <message>` line otherwise; stdout carries only the result. `-h`/`--help` prints
`HELP_TEXT` to stdout and exits 0. Within a run, all progress lines (`Step 1/2: ...`, the web hint)
go to stderr and are suppressed when `--json` is on, keeping stdout parseable.

### Error messages are contract

The suite treats user-facing error strings as contract — `Missing prompt`, `Unknown option: --jsno`,
`Invalid value for --max-cost: invalid`, `Cannot combine`, `Flag "--web-fetch" has no effect`,
`exceeded limit of $0.0005`, `OpenRouter credits or quota error: ...`, `Model does not support
OpenRouter server tools`, `Model unavailable: x-ai/missing-model. Try --economy or override the
configured model alias.` — asserted with `.toThrow`/`.rejects.toThrow` full-message checks so
failures remain greppable and the stdout/stderr contract cannot drift silently.

## Runtime and command notes

- Node ≥ 20 (`"engines": { "node": ">=20" }`), ESM (`"type": "module"`), no runtime dependencies.
- `pnpm test` → `vitest run` (single run, no watch); `pnpm typecheck` → `tsc --noEmit`;
  `pnpm build` → `tsup src/cli.ts --format esm --out-dir dist` (the `grok-research` bin).
- Tests import `../src/*.js` specifiers exactly as production code does (NodeNext resolution).

## Guidance for validating changes narrowly

- Match the existing seam: change to `runMode` dispatch → extend `test/modes.test.ts` with a
  `ModeCaller` fake asserting call count + per-call `role`/`model`/`web`/`json`; change to the
  OpenRouter request/error/retry logic → `test/openrouter.test.ts` with a `fetchImpl` fake;
  bookmark request/params → `test/bookmarks.test.ts`; X prompt/parsing → `test/x-signal.test.ts`
  (no spawn needed); parse/merge/scoring → the pure functions in `test/retrieval.test.ts`.
- Prefer asserting on `caller.mock.calls` (what was dispatched) and exact result fields over
  re-implementing pipeline logic in the assertion; keep fixtures minimal via the `options()` /
  `fakeResult()` helpers.
- Preserve complete failure output: keep `.toThrow("exact expected message")` / `toContain`
  assertions on the full user-facing string when that string is the contract, rather than weakening
  to partial matches.
- Respect `exactOptionalPropertyTypes` in fixtures: omit optional fields with spread (`...(x ===
  undefined ? {} : { x })`) exactly as `src/args.ts`, `src/modes.ts`, and `src/types.ts` do; do not
  assign `undefined` to an optional property.
- When behavior crosses modules (e.g. tool gating in `openrouter.ts` + two-pass in `modes.ts`),
  pin the coupling at both layers with the smallest case that proves the change — the suite already
  demonstrates this by asserting the client-side `json_object` gate before the pipeline-level
  dispatch counts.
- Keep `cli.test.ts` as the only real-subprocess test: end-to-end exit-code/stderr changes belong
  there; everything else stays injected and deterministic.
