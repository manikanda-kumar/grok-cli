# grok-cli

Quality-first Grok and Sonar research CLI powered by OpenRouter.

```bash
OPENROUTER_API_KEY=... pnpm grok "Compare Next.js and Remix"
OPENROUTER_API_KEY=... pnpm grok research --json "Current state of React Server Components"
OPENROUTER_API_KEY=... pnpm grok multi --economy "Choose a vector database for RAG"
```

The CLI defaults to a decision brief and includes cost metadata when OpenRouter returns usage data.
