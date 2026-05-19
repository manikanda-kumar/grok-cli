---
name: grok-research
description: Web-grounded research via grok-cli (xAI Grok + Perplexity Sonar through OpenRouter). Use for decision briefs, tradeoff analysis, cited factual research, real-time signal, X/Twitter-grounded answers, multi-perspective synthesis. Web search on by default for Grok modes. Triggers - "grok this", "ask grok", "x grounded", "research via grok", "deep research", "decision brief", "deepresearch".
---

# grok-research

CLI wrapper for `grok` (grok-cli at `/Users/manik/Github/grok-cli`, linked globally). Routes prompts through OpenRouter to Grok (`x-ai/grok-4.x`) and Perplexity Sonar. Web search runs **server-side** at OpenRouter — single HTTP request, no client tool loop.

## Prereq

`OPENROUTER_API_KEY` in env or `~/.config/grok-cli/config.json`. Missing → tell user `export OPENROUTER_API_KEY=sk-or-...`.

## Modes (pick pipeline)

| Mode | Pipeline | Web grounding |
|------|----------|---------------|
| `auto` (default) | 1× Grok expert | OpenRouter web search **on** |
| `fast` | 1× Grok `grok-4.3` | web search **on** |
| `expert` | 1× Grok `grok-4.20` | web search **on** |
| `deepresearch` | 1× Sonar deep | Sonar-native (no OR web tools) |
| `multi` | Sonar pass + 3× Grok roles (eng/product/skeptic) + synthesis | Sonar leg only; Grok legs **no web** |
| `research` | deprecated alias for `deepresearch` | — |

Add `--economy` for cheaper aliases on any mode.

## Web flags (Grok modes only)

| Flag | Effect |
|------|--------|
| `--no-web` | Disable web search this run (override default) |
| `--web-fetch` | Also enable `openrouter:web_fetch` |
| `--web-engine <auto\|exa\|...>` | Choose search engine |
| `--web-max-results <n>` | Per-search cap (default 5) |
| `--web-max-total-results <n>` | Total cap (default 10) |
| `--web-allowed-domains <csv>` | Allowlist |
| `--web-blocked-domains <csv>` | Blocklist |
| `--web` | **Deprecated** no-op (web is default) |

`--no-web` overrides config. `deepresearch`/`multi`/`research` never use OR web tools regardless.

## Output flags

- (none) → Markdown **decision brief** (Recommendation, Key facts, Tradeoffs, Risks, Sources, Open questions)
- `--report` → longer Markdown report
- `--raw` → plain model output + cost footer
- `--json` → `{mode, web, profile, output_format, answer, content, sources, warnings, usage}`

When web runs, `sources` carries `url_citation` annotations.

## Invocation

```bash
grok [mode] [flags] "<prompt>"
```

Examples:

```bash
grok "Next.js vs Remix for SaaS"                          # default brief, web on
grok fast "Bun vs Node tldr"
grok expert --no-web "Explain mutex"                      # skip web cost for static prompt
grok deepresearch "Stable Node LTS as of 2026"            # Sonar deep
grok multi "Vector DB for latency-sensitive RAG"          # ensemble
grok --json --mode expert "LangGraph vs Mastra"
grok --web-engine exa --web-max-results 8 "AI agent frameworks 2026"
grok --web-allowed-domains "x.com,twitter.com" "what are devs saying about Grok 4.20"
grok --economy fast "Zig 0.13 changes"
```

## Mode selection rules

- Decision / tradeoffs / recommendation → default `auto`, `expert`, or `fast`
- Deep factual research with citations → `deepresearch` (Sonar's strength), **not** Grok-with-web
- X/Twitter signal specifically → Grok mode + `--web-allowed-domains x.com,twitter.com`
- Multi-perspective deep dive, cost OK → `multi`
- Static / no-internet question → add `--no-web` to save ~1.8k prompt tokens
- Structured downstream parsing → add `--json`

## Cost notes

- Footer printed every run: `Cost: $X.XX | Models: ... | Tokens: in/out | Web searches: N`. Pass through to user.
- Attaching web tools adds ~1.8k prompt-token overhead even with **zero** searches (vs ~140 baseline). Use `--no-web` for cheap static prompts.
- Engines like Exa / Parallel bill separately from chat model.
- If usage missing → footer says `Cost: unavailable`.

## How to run

```bash
grok deepresearch "<prompt>" 2>&1
```

JSON parsing for agent chains:

```bash
grok --json deepresearch "<prompt>" | jq '.answer'
grok --json expert "<prompt>" | jq '.sources[].url'
```

## Errors

- `OPENROUTER_API_KEY` missing → instruct user to export.
- `Missing prompt` → prompt empty after flags.
- `Unknown option` → check flag name (e.g. `--no-web` not `--noweb`).
- Network/5xx → retry once, then report.
- `--json` errors emit to **stderr** as JSON.

## Config override

`~/.config/grok-cli/config.json` can set model aliases per profile and default web options (`web.search.enabled`, engine, caps). Don't edit without asking.
