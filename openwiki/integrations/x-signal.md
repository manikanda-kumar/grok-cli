---
type: integration
title: X/Twitter signal via Grok agent (/whathappened)
description: How grok-cli's --x / --x-only / --x-network / --x-timeout / --x-max-turns flags shell out to the headless Grok agent for /whathappened — binary resolution, the GROK_RESEARCH_X_ACTIVE nested guard, marker block parsing and fallbacks, report path extraction, timeout handling, --x-only result shape, and prompt injection of the X signal.
tags: [x-signal, twitter, integration, grok-agent, whathappened, spawn, short-circuit]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-29T08:01:17.972Z
sources:
  - id: openwiki-source-d5eb14827168c0507b57a726
    resource: repo://src/args.ts
  - id: openwiki-source-d2f650c01f560a60ae9115b9
    resource: repo://src/cli.ts
  - id: openwiki-source-c79e883352d36c93a215421f
    resource: repo://src/formatters.ts
  - id: openwiki-source-75e054fe46c678f8d07f2214
    resource: repo://src/modes.ts
  - id: openwiki-source-052041e1d130beaefa6b730d
    resource: repo://src/prompts.ts
  - id: openwiki-source-c457d3d1a63d5dc86f0da7ef
    resource: repo://src/types.ts
  - id: openwiki-source-a631dd81b06cba4e8fe11eac
    resource: repo://src/x-signal.ts
  - id: openwiki-source-14fa96bf66705c0e4b025832
    resource: repo://test/args.test.ts
  - id: openwiki-source-369b91cb61f8f1724ef1d17c
    resource: repo://test/x-signal.test.ts
generated: { by: "openwiki/0.4.3", at: "2026-08-29T08:01:17.972Z" }
---

# X/Twitter signal via Grok agent (/whathappened)

`--x` is grok-cli's **native X/Twitter signal**: instead of proxying X through web search, the CLI shells out from Node to the **Grok agent binary** (`grok`) in headless mode and asks it to run the `/whathappened` skill. The agent's native X tools (`x_keyword_search`, `x_semantic_search`, `x_thread_fetch`, `x_user_search`) produce a machine-readable markdown block about public opinion and event narrative; grok-cli extracts that block, injects it into the OpenRouter research prompts as sample context, and makes the full payload travel on the result.

The feature span is concentrated in `src/x-signal.ts` (spawn, parse, guard, timeout) with flag parsing in `src/args.ts`, orchestration and the `--x-only` short-circuit in `src/modes.ts`, prompt injection in `src/prompts.ts`, and rendering in `src/formatters.ts`.

| Responsibility | Where |
|---|---|
| CLI flags `--x` / `--x-only` / `--x-network` / `--x-timeout` / `--x-max-turns` | `src/args.ts#L280-L310`, `emptyXOptions` (`src/args.ts#L425-L427`) |
| Headless prompt `buildWhathappenedPrompt`, marker block contract | `src/x-signal.ts#L20-L56` |
| Binary resolution (`GROK_BIN` → `~/.grok/bin/grok` → `/usr/local/bin/grok` → `/opt/homebrew/bin/grok` → PATH `grok`) | `resolveGrokBinary` (`src/x-signal.ts#L85-L97`) |
| Headless spawn `grok -p --always-approve --output-format json --max-turns N`, nested-`--x` guard, timeout, failure mapping | `fetchXSignal` + `runProcess` (`src/x-signal.ts#L103-L182`, `L240-L292`) |
| JSON parse fallbacks and marker-block text extraction | `parseGrokHeadlessJson` / `extractJsonCandidates` / `parseXSignalText` / `extractReportPath` (`src/x-signal.ts#L58-L83`, `L184-L238`) |
| Orchestration (before any model call), `--x-only` short-circuit, `--x-only` + `--bookmarks-only` conflict | `src/modes.ts#L95-L142`, `buildXOnlyResult` (`src/modes.ts#L372-L397`) |
| Prompt injection as sample context | `withContext` / `withXInSchemaPrompt` / system instructions (`src/prompts.ts#L82-L106`, `L159-L195`, `src/modes.ts#L310-L313`) |
| Result attachment, JSON `x_signal` payload, `## X report` appendix | `attachXSignal` (`src/modes.ts#L315-L322`), `src/formatters.ts#L69-L77`, `L139-L144` |

## CLI surface

Every `--x*` flag both enables the feature and is self-contained, so they can be combined in any order before the prompt (`test/args.test.ts#L154-L172`):

| Flag | Effect |
|---|---|
| `--x` | Enable the native X signal; runs before web research and consolidates with it |
| `--x-only` | Short-circuit: return the X signal brief only, skipping OpenRouter web research |
| `--x-network <off\|prefer\|strict>` | Network/follow filter for `/whathappened` (default `off`); setting it also enables `--x` |
| `--x-timeout <sec>` | Grok agent timeout in seconds (default 180); setting it also enables `--x` |
| `--x-max-turns <n>` | Max agent turns (default 30); setting it also enables `--x` |

Parsing rules (`src/args.ts#L280-L310`): `--x-only` sets both `enabled` and `only`; `--x-network` is validated against `off|prefer|strict` (invalid values throw `Invalid --x-network: <value> (use off|prefer|strict)`); `--x-timeout` is a positive integer converted to **milliseconds** (`sec * 1000`); `--x-max-turns` is a positive integer. `--x-timeout` and `--x-max-turns` are validated with the shared `parsePositiveInt`. The defaults (`network: "off"`, no timeout/turns) come from `emptyXOptions` (`src/args.ts#L425-L427`); the timeout (180 000 ms) and turns (30) defaults live in `src/x-signal.ts#L7-L8`.

`--x` needs **no `XAI_API_KEY`** and no `OPENROUTER_API_KEY` for the signal itself — it requires Grok Build auth plus native X tools on the `grok` binary (`src/x-signal.ts#L99-L102`).

## Binary resolution

`resolveGrokBinary(env)` picks the agent binary in strict order (`src/x-signal.ts#L85-L97`):

1. `GROK_BIN` env var (trimmed, non-empty) — wins outright.
2. `~/.grok/bin/grok` (`homedir()` + `.grok/bin/grok`), if it exists.
3. `/usr/local/bin/grok`, if it exists.
4. `/opt/homebrew/bin/grok`, if it exists.
5. Fallback: the literal `"grok"`, relying on `PATH`.

There is no test coverage for `resolveGrokBinary` today; the precedence is asserted only by the spawn-failure message in `runProcess`, which tells the user to install/authenticate grok or set `GROK_BIN` (`src/x-signal.ts#L273-L283`).

## Spawn contract

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: a semicolon inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A["runMode: options.x.enabled (before any model call)"] --> B["fetchXSignal: options = topic, network, timeoutMs, maxTurns"]
    B --> C{"GROK_RESEARCH_X_ACTIVE = 1?"}
    C -- yes --> D["throw XSignalError: nested --x disabled, run /whathappened in-session"]
    C -- no --> E["grokBin = options.grokBin or resolveGrokBinary(env)"]
    E --> F["prompt = buildWhathappenedPrompt(topic, network)"]
    F --> G["runProcess: spawn grok -p prompt --always-approve --output-format json --max-turns N, env + GROK_RESEARCH_X_ACTIVE=1"]
    G --> H["code != 0 and stdout empty?"]
    H -- yes --> I["throw XSignalError with stderr/signal/exit detail"]
    H -- no --> J["parseGrokHeadlessJson: last JSON object candidate wins, stderr fallback, plain-text fallback"]
    J --> K["text empty?"]
    K -- yes --> L["throw XSignalError: Grok agent returned empty text"]
    K -- no --> M["parseXSignalText: marker block, reportPath, usedFallback flag"]
    M --> N{"marker block missing?"}
    N -- yes --> O["warning: used full Grok reply as X markdown"]
    N -- no --> P["XSignalResult: markdown, rawText, warnings, optional reportPath/sessionId/costUsd"]
    P --> Q["xMarkdown injected into prompts via withContext; attachXSignal attaches payload; code != 0 also warns"]
    O --> P
```

Caption: `fetchXSignal` spawn → parse → inject path, including the nested-`--x` guard and every failure/warning branch.

`fetchXSignal` (`src/x-signal.ts#L103-L182`) builds the args `["-p", prompt, "--always-approve", "--output-format", "json", "--max-turns", String(maxTurns)]` and spawns the resolved binary with `stdio: ["ignore", "pipe", "pipe"]` (stdin ignored, stdout/stderr captured) and `env` **extended with `GROK_RESEARCH_X_ACTIVE: "1"`** so any nested `grok-research` inside the agent's own tool calls fails loudly instead of recursing (see the guard below). Unless `jsonQuiet` is set (which `runMode` enables for `--json`), a progress line `X signal: invoking Grok agent (<bin>) for /whathappened...` goes to stderr.

### The nested `--x` guard

At the top of `fetchXSignal`, if `env.GROK_RESEARCH_X_ACTIVE === "1"` the function throws `XSignalError` (`src/x-signal.ts#L113-L118`):

> Nested --x is disabled (GROK_RESEARCH_X_ACTIVE=1). When already inside Grok Build, run /whathappened natively and consolidate — do not shell grok-research --x.

The child spawn sets that env var, so a `grok-research --x` spawned *inside* the agent session throws `XSignalError` on the very next `fetchXSignal` call — the recursion is cut at the second level, never reaching a second agent spawn.

### Failure mapping

- **Spawn failure** (`child.on("error")`): `XSignalError` wrapping the OS error, with `Install/authenticate grok or set GROK_BIN` guidance (`src/x-signal.ts#L273-L283`).
- **Non-zero exit with no stdout**: `XSignalError` `Grok agent /whathappened failed (<stderr|signal|exit code>)...` (`src/x-signal.ts#L151-L156`). A **non-zero exit with stdout is tolerated**: the parsed text still becomes the signal, and a warning `Grok agent exited with code <code>; partial X signal may be incomplete.` is appended (`src/x-signal.ts#L169-L171`).
- **Empty text after parsing**: `XSignalError` `Grok agent returned empty text for /whathappened.` (`src/x-signal.ts#L161-L163`).
- **Timeout**: `runProcess` rejects with `XSignalError` after `timeoutMs`, killing the child with `SIGTERM` and, 2 seconds later, `SIGKILL` (`src/x-signal.ts#L256-L262`). The kill timer is `unref`'d. The process result resolution and the timeout settle are mutually exclusive via the `settled` flag, which also guards the spawn-error path.

X-signal failures are **hard failures** — unlike the bookmark overlay, which never throws. An `XSignalError` propagates through `runMode` to `cli.ts`, which formats it on stderr and exits 1 (`src/cli.ts#L60-L68`).

## The headless prompt

`buildWhathappenedPrompt(topic, network)` (`src/x-signal.ts#L20-L56`) builds one multi-line string:

- The invocation line `/whathappened <topic>`.
- A framing message naming the **whathappened skill** (`~/.grok/skills/whathappened/SKILL.md` and its `references/`).
- **Hard run rules**: native X tools only for public opinion/event narrative, no invented posts/handles/engagement/URLs, at most one web lookup for entity identity, and the network line.
- The **machine-readable block contract**: `## X_SIGNAL_MARKDOWN` … `## END_X_SIGNAL` delimiters containing window/mode/confidence/network mode, what happened (2–5 sentences), conversation frames, a rough opinion map (camps), receipts (5–10 items with `@handle` and `https://x.com/.../status/...` when known), and gaps, kept under ~1500 words with no invented links.
- A trailing `Topic: <topic>` line.

`--x-network` translates to one of three network lines (`src/x-signal.ts#L22-L27`): `off` → `Network filter: OFF (global X).`; `prefer` → boost people the user follows / list members when relevant; `strict` → only people the user follows / list members, except official origin.

## Parsing: JSON, then the marker block

Two parsing layers run in sequence on the child output.

### `parseGrokHeadlessJson` (agent output → text)

`parseGrokHeadlessJson(stdout, stderr)` (`src/x-signal.ts#L184-L229`) tolerates three shapes:

1. **Empty stdout** → text = trimmed stderr, warning `Grok stdout empty; fell back to stderr.`
2. **JSON candidates** — `extractJsonCandidates` first collects whole-line objects (`lines.filter(l => l.startsWith("{") && l.endsWith("}"))`, which covers `streaming-json` emitting one object per line), falling back to the whole trimmed stdout when it starts with `{` (pretty-printed JSON). Candidates are tried **in reverse** — the last JSON object wins — and the first candidate that parses with a string `text` or `result` field is returned. Side fields are harvested when present: `sessionId` (`sessionId`), `costUsd` (`total_cost_usd` or `totalCostUsd`, only when finite numbers).
3. **No parseable JSON** → text = trimmed stdout with warning `Could not parse Grok --output-format json; treating stdout as plain text.`

### `parseXSignalText` (text → markdown)

`parseXSignalText(rawText)` (`src/x-signal.ts#L58-L74`) slices between `## X_SIGNAL_MARKDOWN` and `## END_X_SIGNAL` (both present, end after start); the extracted markdown is trimmed. **Fallback**: if either marker is missing, the full trimmed text becomes `markdown` and `usedFallback = true` — which `fetchXSignal` surfaces as the warning `X signal marker block missing; used full Grok reply as X markdown.` (`src/x-signal.ts#L166-L168`).

### Report path extraction

`extractReportPath(text)` (`src/x-signal.ts#L76-L83`) tries, in order:

1. Labeled form: `**Report:** <path>.html` or `Report: <path>.html` (case-insensitive, `\S+\.html`).
2. Free-text form: a whitespace-delimited path starting with `/`, `./`, or `~/`, containing `whathappened`, ending in `.html` (e.g. `~/whathappened-reports/whathappened-foo-1.html`).

Both are pinned by `test/x-signal.test.ts` (`L24-L55`). The path becomes `XSignalResult.reportPath` and eventually the `## X report` appendix in markdown output and `report_path` in the JSON payload.

## Result shape and `--x-only`

`fetchXSignal` returns `XSignalResult` (`src/types.ts#L154-L161`): `markdown` (the extracted block or fallback), `rawText` (full agent text — deliberately never emitted in JSON), `warnings`, plus optional `reportPath` / `sessionId` / `costUsd` when the parse surfaced them.

`XSignalResult` / `XSignalOptions` / `CliXOptions` / `XNetworkMode` are declared in `src/types.ts#L82-L93`, `L144-L161`.

### `--x-only` short-circuit

When `options.x.only`, `runMode` returns `buildXOnlyResult` early, before any OpenRouter call (`src/modes.ts#L133-L135`, `L372-L397`):

- `content` = `# X Signal Brief\n\n<markdown.trim()>` plus `\n\n**HTML report:** <reportPath>` when the report path was found.
- **`usage` = `emptyUsage()`** — zero model calls, no OpenRouter budget consumed.
- **`sources` = `[]`** (the receipts stay inside the markdown; there is no citation/source plumbing).
- `web` = `{ searchEnabled: false, fetchEnabled: false }`.
- `warnings` = deduped deprecation/feature warnings plus the X-signal warnings.
- `xSignal` is attached, so the JSON payload still carries the `x_signal` object.
- Throws `--x-only requires a successful X signal from the Grok agent.` when the signal is missing, and combining `--x-only` with `--bookmarks-only` is a hard error (`Cannot combine --x-only with --bookmarks-only.`, `src/modes.ts#L129-L131`).

## Consolidation: injection and attachment

When `--x` runs (without `--x-only`), `runMode` passes `xSignal.markdown` into every prompt builder as `xMarkdown` (`src/modes.ts#L141-L142`): `buildSingleCallMessages`, `buildResearchMessages`, `buildSynthesisMessages`, and the `--schema` single/research passes forward it to `withContext(prompt, xSignalMarkdown, bookmarksMarkdown)` (`src/prompts.ts#L88-L106`). The injected block is framed as **sample context**, not ground truth:

> ## Live X/Twitter public conversation (from /whathappened via Grok agent native X tools)
> Treat this as a sample of public conversation on X — not ground truth and not a substitute for docs, changelogs, or benchmarks.
> Prefer web/docs for product facts and versions. Use X for reception, sentiment, controversy, and first-party launch chatter.
> When writing the brief, include a short ## X signal section summarizing camps and linking key receipts when relevant.

Two other injection paths exist: `--schema` prompts append `Live X/Twitter sample (for context):` via `withXInSchemaPrompt` (`src/modes.ts#L310-L313`), and the retrieve `--output both` synthesis block labels it `Live X/Twitter sample:` (`src/modes.ts#L431-L438`). The system prompt also gains the `X_SIGNAL_INSTRUCTION` — frame opinion as public conversation on the sample, do not invent posts, include `## X signal` when material — whenever `hasXSignal` is true (`src/prompts.ts#L159-L160`, `L190-L192`). Injection behavior is pinned by `test/prompts.test.ts#L28-L34`.

After the branch builds its result, `attachContext` → `attachXSignal` attaches `PipelineResult.xSignal` and folds (deduped) X warnings into `result.warnings` (`src/modes.ts#L315-L339`). The two-pass `--json`+web and `--schema`+web **format passes do not re-receive the X markdown** — the research pass already consumed it (`src/prompts.ts` format builders carry only research content plus source URLs).

Rendering: `formatJson` emits `x_signal` (`markdown`, `report_path` or null, `session_id` or null, `cost_usd` or null, `warnings`) when `xSignal` is present (`src/formatters.ts#L69-L77`, pinned by `test/formatters.test.ts#L65-L69`), and `xSignalAppendix` appends `## X report\n- <reportPath>` to markdown/raw output only when the report path exists and the content does not already contain it (`src/formatters.ts#L139-L144`).

## Lifecycle and invariants

- **Gathering order**: the X signal (and bookmarks) run **before any model call** so the model never waits on them; a skipped or failed signal degrades to warnings or a hard error respectively (`src/modes.ts#L95-L106`).
- **Nested recursion is cut at level 2**: the child spawn inherits `GROK_RESEARCH_X_ACTIVE=1`, so an agent tool call that shells `grok-research --x` throws `XSignalError` in the grandchild before spawning anything.
- **X failures are hard, partial results are soft**: spawn failure, empty text, non-zero exit with no stdout, and timeout throw `XSignalError` → exit 1; non-zero exit *with* stdout and a missing marker block are warnings and the run continues.
- **`--x-only` is a zero-model-call short-circuit**: `emptyUsage()`, empty sources, web off, `# X Signal Brief` content; `--x` consolidation still runs the full web-research pipeline with the signal injected.
- **The signal is context, not truth**: injected text is framed as a sample of public conversation; web/docs remain the authority for product facts.
- **Raw agent text never leaks into JSON**: `rawText` is internal; the JSON payload carries only `markdown` and metadata.

## Focused tests

- `test/x-signal.test.ts` — prompt contract (`/whathappened` line, required marker block, network lines, `L8-L21`), marker extraction with the labeled report path (`L24-L40`), full-text fallback when markers are missing (`L42-L46`), and free-text report path extraction (`L49-L54`).
- `test/args.test.ts#L154-L172` — `--x` / `--x-only` / `--x-network` / `--x-timeout` / `--x-max-turns` parsing (seconds→ms conversion, `enabled` side effects), invalid `--x-network` rejection.
- `test/prompts.test.ts#L28-L34` — X signal injection into system and user messages, and `withXSignal` leaving the prompt unchanged without markdown (`L45-L49`).
- `test/formatters.test.ts#L65-L74` — JSON `x_signal` payload shape and the `## X report` appendix (including the no-double-print rule).
- `test/modes.test.ts` — the `x` fixture plumbing (`L21`) and the `--x-only`/`--bookmarks-only` conflict enforced in `runMode` (`src/modes.ts#L129-L131`).
