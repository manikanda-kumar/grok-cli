# Grok CLI Design

## Purpose

Build a TypeScript/Node CLI named `grok` that uses OpenRouter credits to access xAI Grok and Perplexity Sonar models for grounded research and decision support. The primary consumers are humans and other coding agents such as Claude, Codex, and Amp that need concise, cited facts and recommendations for framework, technology, and product choices.

## Goals

- Provide a `grok` command with human-friendly subcommands and agent-friendly flags.
- Default to best-in-class, quality-first model routing.
- Offer `--economy` for lower-cost fallbacks.
- Use Grok models for fast, expert, auto, and analysis work.
- Use OpenRouter-hosted Perplexity Sonar models for grounded research.
- Support a local multi-agent research ensemble that combines Sonar facts with Grok analysis roles.
- Emit a decision brief by default, with `--report`, `--raw`, and `--json` alternatives.
- Include token and cost metadata in every response when OpenRouter returns usage data.
- Keep v1 lean: no crawler, database, vector store, browser automation, or separate web search provider.

## Non-goals

- Do not require an xAI subscription.
- Do not implement local web crawling or scraping in v1.
- Do not store API keys with a `config set-key` command in v1.
- Do not build a persistent research history database in v1.
- Do not implement a TUI or interactive chat interface in v1.

## User-facing command shape

The CLI supports both positional mode subcommands and flags:

```bash
grok "Should we use Next.js or Remix for a docs-heavy SaaS?"
grok fast "Summarize Bun vs Node tradeoffs"
grok expert "Evaluate PostgreSQL vs ClickHouse for event analytics"
grok research "Find grounded facts about the current Vercel AI SDK"
grok multi "Choose the best vector DB for this product"
grok --mode expert --json "Compare LangGraph and Mastra"
grok --economy "What is the cheapest reliable LLM eval stack?"
grok --report research "Current state of React Server Components"
grok --raw expert "Give me the direct model response"
```

Supported modes:

- `auto`
- `fast`
- `expert`
- `research`
- `multi`

Supported output flags:

- `--json`: machine-readable result.
- `--report`: longer research report.
- `--raw`: minimally shaped model output.
- default: decision brief.

Supported cost/profile flags:

- `--economy`: use economy model aliases.
- default profile: quality.

## Architecture

```diagram
╭──────────────╮
│ CLI command  │
╰──────┬───────╯
       ▼
╭────────────────╮
│ Args / config  │
╰──────┬─────────╯
       ▼
╭────────────────╮
│ Mode router    │
╰──┬────┬────┬────╯
   │    │    │
   │    │    ▼
   │    │ ╭──────────────╮
   │    │ │ Research     │──▶ Sonar via OpenRouter
   │    │ │ pipeline     │
   │    │ ╰──────┬───────╯
   │    │        ▼
   │    │ ╭──────────────╮
   │    ╰▶│ Grok analysis│──▶ Grok via OpenRouter
   │      ╰──────┬───────╯
   │             ▼
   │      ╭──────────────╮
   ╰─────▶│ Formatter    │──▶ Markdown / JSON / raw
          ╰──────────────╯
```

Core modules:

- `src/cli.ts`: command entrypoint, argument parsing, stdout/stderr behavior.
- `src/config.ts`: hardcoded defaults, optional config file loading, env handling, model alias resolution.
- `src/openrouter.ts`: small OpenRouter Chat Completions wrapper, usage parsing, API error mapping.
- `src/modes.ts`: mode router and pipeline orchestration.
- `src/prompts.ts`: decision brief, report, raw, research, and role-specific multi-agent prompts.
- `src/formatters.ts`: Markdown, JSON, and raw output formatting.
- `src/cost.ts`: usage accumulation and OpenRouter pricing/cost extraction.
- `src/types.ts`: shared types used across modules.

## Model routing

Quality-first defaults use current OpenRouter model IDs verified on 2026-05-19:

```json
{
  "quality": {
    "fast": "x-ai/grok-4.3",
    "expert": "x-ai/grok-4.20",
    "research": "perplexity/sonar-pro-search",
    "deepResearch": "perplexity/sonar-deep-research",
    "nativeMulti": "x-ai/grok-4.20-multi-agent"
  },
  "economy": {
    "fast": "x-ai/grok-4.3",
    "expert": "x-ai/grok-4.3",
    "research": "perplexity/sonar",
    "deepResearch": "perplexity/sonar",
    "nativeMulti": "x-ai/grok-4.3"
  }
}
```

The config file may override any alias because OpenRouter model availability and pricing can change.

## Mode behavior

### `auto`

Default mode. Uses quality profile unless `--economy` is passed. Produces a decision brief from `expert` Grok by default. It does not perform research unless the user chooses `research`, `multi`, or a future explicit research flag.

### `fast`

Single Grok call optimized for low latency. Uses the profile's `fast` alias. Produces a concise decision brief unless `--raw`, `--report`, or `--json` is selected.

### `expert`

Single Grok call optimized for depth and reasoning. Uses the profile's `expert` alias. This is the primary mode for non-grounded architecture and product analysis.

### `research`

Single Sonar call optimized for grounded facts and citations. Uses the profile's `research` alias by default. `--report` may use `deepResearch` where appropriate.

### `multi`

Local research ensemble:

1. Run a Sonar grounded research pass.
2. Run three Grok analysis agents in parallel with the Sonar findings:
   - Engineering feasibility reviewer.
   - Product/business tradeoff reviewer.
   - Skeptic/risk reviewer.
3. Run a final Grok synthesis pass that produces the decision brief or report.

If one analysis role fails but research and at least one role succeed, continue and include warnings. If the research pass fails, fail the multi run because the mode's value depends on grounded facts.

## Configuration and credentials

Credentials:

- Prefer `OPENROUTER_API_KEY` for automation and CI.
- Support optional config file at `~/.config/grok-cli/config.json`.
- Do not write secrets in v1.

Example config:

```json
{
  "defaultMode": "auto",
  "defaultProfile": "quality",
  "models": {
    "quality": {
      "fast": "x-ai/grok-4.3",
      "expert": "x-ai/grok-4.20",
      "research": "perplexity/sonar-pro-search",
      "deepResearch": "perplexity/sonar-deep-research",
      "nativeMulti": "x-ai/grok-4.20-multi-agent"
    },
    "economy": {
      "fast": "x-ai/grok-4.3",
      "expert": "x-ai/grok-4.3",
      "research": "perplexity/sonar",
      "deepResearch": "perplexity/sonar",
      "nativeMulti": "x-ai/grok-4.3"
    }
  },
  "openrouter": {
    "appName": "grok-cli",
    "siteUrl": "https://github.com/local/grok-cli"
  }
}
```

Precedence:

1. Hardcoded defaults.
2. Config file overrides.
3. Environment variables.
4. CLI flags.

## Output contracts

### Markdown decision brief

Default output:

```md
# Decision Brief

## Recommendation
...

## Key facts
- ...

## Tradeoffs
- ...

## Risks / unknowns
- ...

## Sources
- ...

---
Cost: $0.0421 | Models: x-ai/grok-4.20, perplexity/sonar-pro-search | Tokens: 12,300 in / 2,100 out
```

If cost cannot be computed, the footer must say `Cost: unavailable` rather than inventing a value.

### JSON

`--json` output is stable enough for other agents to parse:

```json
{
  "mode": "multi",
  "profile": "quality",
  "output_format": "brief",
  "answer": {
    "recommendation": "...",
    "key_facts": [],
    "tradeoffs": [],
    "risks": [],
    "open_questions": [],
    "confidence": "medium"
  },
  "sources": [],
  "warnings": [],
  "usage": {
    "total_prompt_tokens": 0,
    "total_completion_tokens": 0,
    "cost_usd": 0,
    "calls": [
      {
        "role": "research",
        "model": "perplexity/sonar-pro-search",
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "cost_usd": 0
      }
    ]
  }
}
```

### Report and raw

- `--report`: longer Markdown sections with background, evidence, alternatives, recommendation, and sources.
- `--raw`: print the model's content with only the cost footer appended unless `--json` is also passed.

## Cost and usage

OpenRouter responses may include usage and cost metadata. The CLI should:

- Prefer actual `usage.cost` or equivalent provider metadata if present.
- Otherwise compute cost only when pricing is known in configuration or model metadata.
- Accumulate per-call and total usage.
- Show total cost in Markdown footer.
- Include per-call cost in JSON.
- Never estimate silently if required pricing data is missing.

## Error handling

- Missing API key: explain `OPENROUTER_API_KEY` and config file location.
- Auth, quota, or credit errors: show the OpenRouter/provider message.
- Model unavailable: show selected model and suggest `--economy` or config override.
- Network failures: show a concise retryable error.
- Multi-agent partial failure: continue if research and at least one role succeed; include warnings.
- JSON mode errors: emit JSON error objects when possible.

## Testing strategy

Automated tests should cover:

- CLI argument parsing for positional prompt, subcommands, `--mode`, `--json`, `--report`, `--raw`, and `--economy`.
- Config precedence and model alias resolution.
- Mode router selection and multi-agent partial failure behavior.
- Formatter output, including Markdown cost footer and stable JSON shape.
- OpenRouter client response parsing, usage extraction, and API error mapping with mocked `fetch`.

Manual smoke tests after implementation:

```bash
OPENROUTER_API_KEY=... pnpm grok --help
OPENROUTER_API_KEY=... pnpm grok "Compare Next.js and Remix for a SaaS app"
OPENROUTER_API_KEY=... pnpm grok research --json "Current state of React Server Components"
OPENROUTER_API_KEY=... pnpm grok multi --economy "Choose a vector database for RAG"
```

## Review checkpoints

Implementation should use sub-agent-driven development. Each task should be implemented by a fresh worker where practical, then reviewed before marking complete.

Required review checkpoints:

1. Project scaffold and public CLI contract.
2. Config/model routing and OpenRouter client.
3. Prompt/output contracts.
4. Mode pipeline behavior, especially `multi`.
5. Final test and smoke-test review.

## Open questions deferred from v1

- Whether to add `--native-multi` for direct `x-ai/grok-4.20-multi-agent` calls.
- Whether to add URL ingestion later.
- Whether to add persistent run history and caching.
- Whether to publish as an npm package or keep as a local workspace CLI.
