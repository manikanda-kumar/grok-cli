# grok-cli

CLI for technology and product decisions via OpenRouter (xAI Grok + Perplexity Sonar). Built for humans and coding agents that need recommendations, tradeoffs, and cited facts—not chat.

**Requires:** `OPENROUTER_API_KEY` in the environment or `~/.config/grok-cli/config.json`.

## Command shape

```text
grok [flags...] <prompt>
grok <mode> [flags...] <prompt>
```

- **`<prompt>`** — required; last argument (or everything after `--`).
- **`<mode>`** — optional positional token; same values as `--mode`. Only recognized as the first non-flag argument.
- **Flags** can appear in any order before the prompt.

Dev checkout: use `pnpm grok` instead of `grok`.

## Modes (routing)

Modes choose **which pipeline runs**, not output format. Default mode is `auto`.

| Mode | Models | API calls | Web grounding |
|------|--------|-----------|---------------|
| `auto` | Same as `expert` | 1× Grok | OpenRouter web search **on** (default) |
| `fast` | `grok-4.3` | 1× Grok | web search on (default) |
| `expert` | `grok-4.20` | 1× Grok | web search on (default) |
| `deepresearch` | Sonar deep (`sonar-deep-research` / economy `sonar-pro`) | 1× Sonar | Sonar only — no OpenRouter web tools |
| `multi` | Sonar + 3× Grok roles + synthesis | 5+ calls | Sonar pass only; Grok legs **no** web tools |
| `research` | *(deprecated alias for `deepresearch`)* | same | same |

**Mode choice for agents:**

- Decisions / tradeoffs → `grok "..."`, `grok expert "..."`, or `grok fast "..."` (web on by default; stderr hint each run)
- Deep factual research → `grok deepresearch "..."` (Sonar deep — do **not** use default Grok for this)
- Multi-perspective synthesis → `grok multi "..."` (Sonar supplies facts; Grok legs have no web tools)

```bash
grok deepresearch "Latest stable Node.js LTS version as of 2026"
grok --mode deepresearch "Latest stable Node.js LTS version as of 2026"
# deprecated alias:
grok research "..."
```

## Flags (not modes)

| Flag | Effect |
|------|--------|
| `--no-web` | Disable OpenRouter web search for this run (Grok modes only) |
| `--web` | **Deprecated.** No-op with stderr warning; search is already on by default |
| `--web-fetch` | Also attach `openrouter:web_fetch` when web is enabled (Grok modes only) |
| `--web-engine <engine>` | Search engine: `auto` (default), `exa`, etc. |
| `--web-max-results <n>` | Max results per search (default: 5) |
| `--web-max-total-results <n>` | Cap total search results across the request (default: 10) |
| `--web-allowed-domains <d>` | Comma-separated allowlist |
| `--web-blocked-domains <d>` | Comma-separated blocklist |
| `--economy` | Cheaper model aliases. Default profile is `quality`. |
| `--json` | Structured JSON on stdout (works with web tools). Errors are JSON on stderr. |
| `--report` | Longer Markdown report headings instead of a decision brief. |
| `--raw` | Model text + cost footer only; no brief/report scaffolding. |
| `-h`, `--help` | Usage text; exit 0. |

**Precedence:** CLI `--no-web` overrides config `web.search.enabled`. Modes `deepresearch`, `multi`, and deprecated `research` never enable OpenRouter web tools.

```bash
grok fast --raw "One sentence: what is Bun?"
grok --mode expert --json "Bun vs Node for a CLI tool"
grok --no-web expert "Explain what a mutex is"
grok deepresearch "Current state of React Server Components"
grok multi "Redis or Memcached for session cache only"
```

## Web search cost notes

OpenRouter runs `openrouter:web_search` and optional `openrouter:web_fetch` **server-side** in a single HTTP request—no client tool loop.

- Attaching web tools adds prompt-token overhead even when the model runs **zero** searches (~1.8k tokens vs ~140 baseline in spike). Use `--no-web` for static or cheap prompts.
- When the model searches, prompt tokens and cost rise sharply (searches inject context). Footer and `--json` show `web_search_requests` / `web_fetch_requests` when present.
- Search engines like **Exa** or **Parallel** may bill separately from the chat model; check [OpenRouter server tools](https://openrouter.ai/docs/guides/features/server-tools) pricing. Use `--web-engine exa` for a fixed engine instead of `auto`.

## Output (default vs flags)

| Invocation | stdout |
|------------|--------|
| (default) | Markdown **decision brief** (`# Decision Brief`, Recommendation, Key facts, Tradeoffs, Risks, Sources, Open questions) |
| `--report` | Markdown **research report** (longer sections) |
| `--raw` | Plain model output |
| `--json` | JSON: `mode`, `web`, `profile`, `output_format`, `answer`, `content`, `sources`, `warnings`, `usage` |

When web search runs, `sources` includes `url_citation` annotations from OpenRouter. Footer example:

```text
---
Cost: $0.0120 | Models: x-ai/grok-4.20 | Tokens: 2,100 in / 800 out | Web searches: 2
```

**stderr** on Grok runs with web enabled:

```text
hint: OpenRouter web search is enabled (--no-web to disable)
```

## For coding agents

1. **Do not pass `--web`** — deprecated and unnecessary. Web search is on by default for `auto` / `fast` / `expert`.
2. **Use `--no-web`** for timeless or minimum-cost Grok runs.
3. **Use `deepresearch` for deep factual research** — not default `grok "..."`. `research` is a deprecated alias.
4. **Use `multi` for ensemble synthesis** — not to “turn on web”.
5. **Prefer `--json`** for `answer`, `sources`, and `usage.server_tool_use`.
6. **Prompts that start with `-`:** `grok -- --not-a-flag`
7. **Exit code:** `0` success, `1` error.

## Examples

```bash
grok "Latest stable Node.js LTS version as of 2026"
grok --no-web fast "Explain what a mutex is"
grok --mode expert --json "Compare Bun vs Node for a CLI tool"
grok deepresearch "Latest stable Node.js LTS version as of 2026"
grok multi "Redis or Memcached for session cache only"
grok --web-fetch expert "Summarize the OpenRouter web search tool docs"
```

## Model aliases (`config.json` overrides)

**Quality** (default):

| Alias | Model |
|-------|--------|
| `fast` | `x-ai/grok-4.3` |
| `expert` | `x-ai/grok-4.20` |
| `research` | `perplexity/sonar-reasoning-pro` |
| `deepResearch` | `perplexity/sonar-deep-research` |
| `nativeMulti` | `x-ai/grok-4.20-multi-agent` |

**Economy** (`--economy`):

| Alias | Model |
|-------|--------|
| `fast` | `x-ai/grok-4.3` |
| `expert` | `x-ai/grok-4.3` |
| `research` | `perplexity/sonar-pro` |
| `deepResearch` | `perplexity/sonar-pro` |
| `nativeMulti` | `x-ai/grok-4.3` |

`deepresearch` mode uses the `deepResearch` alias. `multi` uses the `research` alias (Sonar reasoning-pro) for its first pass.

## Config

Optional `~/.config/grok-cli/config.json`:

```json
{
  "defaultMode": "auto",
  "defaultProfile": "quality",
  "web": {
    "search": {
      "enabled": true,
      "engine": "auto",
      "maxResults": 5,
      "maxTotalResults": 10
    },
    "fetch": {
      "enabled": false,
      "engine": "auto",
      "maxContentTokens": 50000
    }
  }
}
```

## Setup

```bash
pnpm install
export OPENROUTER_API_KEY=sk-or-...
pnpm test
```

Implementation plan: [`docs/plans/2026-05-19-web-search-integration.md`](docs/plans/2026-05-19-web-search-integration.md)

## Claude Code skill

Reusable Claude Code skill at [`skills/grok-research/`](skills/grok-research/SKILL.md). Teaches any Claude Code agent when/how to call `grok` (mode selection, web flags, JSON parsing, X/Twitter grounding via `--web-allowed-domains`).

Install for your user:

```bash
mkdir -p ~/.claude/skills
cp -R skills/grok-research ~/.claude/skills/
```

Or symlink so updates flow automatically:

```bash
ln -s "$(pwd)/skills/grok-research" ~/.claude/skills/grok-research
```

Skill assumes `grok` is on `PATH`. After `pnpm build`, run `npm link` (or `pnpm link --global`) once to expose it globally.
