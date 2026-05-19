# grok-cli

Quality-first Grok and Sonar research CLI powered by OpenRouter.

## Setup

```bash
pnpm install
export OPENROUTER_API_KEY=sk-or-...
```

Optional config path:

```text
~/.config/grok-cli/config.json
```

## Usage

```bash
pnpm grok "Compare Next.js and Remix for a SaaS app"
pnpm grok fast "Summarize Bun vs Node"
pnpm grok expert "Evaluate PostgreSQL vs ClickHouse"
pnpm grok research "Current state of React Server Components"
pnpm grok multi "Choose a vector database for RAG"
pnpm grok --mode expert --json "Compare LangGraph and Mastra"
pnpm grok --economy "Cheapest reliable LLM eval stack"
```

## Model profiles

Quality defaults:

- `fast`: `x-ai/grok-4.3`
- `expert`: `x-ai/grok-4.20`
- `research`: `perplexity/sonar-pro-search`
- `deepResearch`: `perplexity/sonar-deep-research`
- `nativeMulti`: `x-ai/grok-4.20-multi-agent`

Economy defaults:

- `fast`: `x-ai/grok-4.3`
- `expert`: `x-ai/grok-4.3`
- `research`: `perplexity/sonar`
- `deepResearch`: `perplexity/sonar`
- `nativeMulti`: `x-ai/grok-4.3`

## Output

Default output is a decision brief. Use `--report`, `--raw`, or `--json` for alternate output formats.

Every response includes a cost footer when OpenRouter returns usage data. If cost cannot be computed, the CLI prints `Cost: unavailable`.
