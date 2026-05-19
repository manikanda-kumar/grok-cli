# Grok CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node `grok` CLI that uses OpenRouter Grok and Sonar models for quality-first decision briefs, grounded research, and multi-agent analysis with cost reporting.

**Architecture:** The CLI is a small Node package with focused modules for argument parsing, config/model alias resolution, OpenRouter calls, mode orchestration, prompts, formatting, and cost tracking. Quality-first defaults are hardcoded, config overrides are optional, and `--economy` selects cheaper aliases. Multi-agent mode runs a Sonar research pass, parallel Grok analysis roles, and a Grok synthesis pass.

**Tech Stack:** TypeScript, Node.js ESM, `tsx` for development, `tsup` for builds, `vitest` for tests, built-in `fetch`, and OpenRouter Chat Completions API.

---

## Planned file structure

- Create: `package.json` — package metadata, bin mapping, scripts, dependencies.
- Create: `tsconfig.json` — strict TypeScript compiler settings.
- Create: `src/types.ts` — shared mode, config, response, usage, and OpenRouter types.
- Create: `src/defaults.ts` — default quality/economy model aliases and config constants.
- Create: `src/args.ts` — CLI argument parser and help text.
- Create: `src/config.ts` — config file loading, env handling, model resolution.
- Create: `src/cost.ts` — usage/cost aggregation helpers.
- Create: `src/openrouter.ts` — OpenRouter API wrapper and error mapping.
- Create: `src/prompts.ts` — system/user prompts for brief, report, research, role analysis, and synthesis.
- Create: `src/formatters.ts` — Markdown, JSON, raw, and error formatters.
- Create: `src/modes.ts` — fast, expert, research, auto, and multi pipelines.
- Create: `src/cli.ts` — executable CLI entrypoint.
- Create: `test/args.test.ts` — parser tests.
- Create: `test/config.test.ts` — config precedence tests.
- Create: `test/cost.test.ts` — usage aggregation tests.
- Create: `test/formatters.test.ts` — output contract tests.
- Create: `test/openrouter.test.ts` — mocked API tests.
- Create: `test/modes.test.ts` — mode routing and partial failure tests.
- Create: `README.md` — install, config, examples, and model routing docs.

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/cli.ts`
- Create: `README.md`

- [x] **Step 1: Create `package.json`**

```json
{
  "name": "grok-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "grok": "dist/cli.js"
  },
  "scripts": {
    "build": "tsup src/cli.ts --format esm --dts --clean --out-dir dist",
    "dev": "tsx src/cli.ts",
    "grok": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "latest",
    "tsup": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [x] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [x] **Step 3: Create temporary `src/cli.ts` smoke entrypoint**

```ts
#!/usr/bin/env node

console.log("grok-cli scaffold ready");
```

- [x] **Step 4: Create initial `README.md`**

````md
# grok-cli

Quality-first Grok and Sonar research CLI powered by OpenRouter.

```bash
OPENROUTER_API_KEY=... pnpm grok "Compare Next.js and Remix"
OPENROUTER_API_KEY=... pnpm grok research --json "Current state of React Server Components"
OPENROUTER_API_KEY=... pnpm grok multi --economy "Choose a vector database for RAG"
```

The CLI defaults to a decision brief and includes cost metadata when OpenRouter returns usage data.
````

- [x] **Step 5: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `node_modules` and a lockfile are created, and no install errors occur.

- [x] **Step 6: Verify scaffold**

Run:

```bash
pnpm typecheck
pnpm build
pnpm grok
```

Expected: typecheck and build pass; `pnpm grok` prints `grok-cli scaffold ready`.

- [x] **Step 7: Commit scaffold**

```bash
git add package.json pnpm-lock.yaml tsconfig.json src/cli.ts README.md
git commit -m "chore: scaffold grok cli"
```

## Task 2: Shared types and defaults

**Files:**
- Create: `src/types.ts`
- Create: `src/defaults.ts`
- Test: `test/config.test.ts`

- [x] **Step 1: Create `src/types.ts`**

```ts
export type Mode = "auto" | "fast" | "expert" | "research" | "multi";

export type Profile = "quality" | "economy";

export type OutputFormat = "brief" | "report" | "raw";

export type ModelAlias = "fast" | "expert" | "research" | "deepResearch" | "nativeMulti";

export type ModelAliases = Record<ModelAlias, string>;

export interface ModelProfiles {
  quality: ModelAliases;
  economy: ModelAliases;
}

export interface OpenRouterConfig {
  apiKey?: string;
  appName: string;
  siteUrl?: string;
}

export interface AppConfig {
  defaultMode: Mode;
  defaultProfile: Profile;
  models: ModelProfiles;
  openrouter: OpenRouterConfig;
}

export interface CliOptions {
  prompt: string;
  mode: Mode;
  profile: Profile;
  outputFormat: OutputFormat;
  json: boolean;
}

export interface UsageCall {
  role: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  costUsd?: number;
  calls: UsageCall[];
}

export interface Source {
  title?: string;
  url: string;
}

export interface DecisionAnswer {
  recommendation: string;
  keyFacts: string[];
  tradeoffs: string[];
  risks: string[];
  openQuestions: string[];
  confidence: "low" | "medium" | "high";
}

export interface PipelineResult {
  mode: Mode;
  profile: Profile;
  outputFormat: OutputFormat;
  content: string;
  answer?: DecisionAnswer;
  sources: Source[];
  warnings: string[];
  usage: UsageSummary;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

export interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenRouterUsage;
  citations?: string[];
}
```

- [x] **Step 2: Create `src/defaults.ts`**

```ts
import type { AppConfig, ModelProfiles } from "./types.js";

export const DEFAULT_MODELS: ModelProfiles = {
  quality: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.20",
    research: "perplexity/sonar-pro-search",
    deepResearch: "perplexity/sonar-deep-research",
    nativeMulti: "x-ai/grok-4.20-multi-agent"
  },
  economy: {
    fast: "x-ai/grok-4.3",
    expert: "x-ai/grok-4.3",
    research: "perplexity/sonar",
    deepResearch: "perplexity/sonar",
    nativeMulti: "x-ai/grok-4.3"
  }
};

export const DEFAULT_CONFIG: AppConfig = {
  defaultMode: "auto",
  defaultProfile: "quality",
  models: DEFAULT_MODELS,
  openrouter: {
    appName: "grok-cli",
    siteUrl: "https://github.com/local/grok-cli"
  }
};

export const DEFAULT_CONFIG_PATH = "~/.config/grok-cli/config.json";
```

- [x] **Step 3: Add initial defaults test in `test/config.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";

describe("defaults", () => {
  it("uses quality-first Grok and Sonar defaults", () => {
    expect(DEFAULT_CONFIG.defaultProfile).toBe("quality");
    expect(DEFAULT_CONFIG.models.quality.fast).toBe("x-ai/grok-4.3");
    expect(DEFAULT_CONFIG.models.quality.expert).toBe("x-ai/grok-4.20");
    expect(DEFAULT_CONFIG.models.quality.research).toBe("perplexity/sonar-pro-search");
  });
});
```

- [x] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm test test/config.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [x] **Step 5: Commit types and defaults**

```bash
git add src/types.ts src/defaults.ts test/config.test.ts
git commit -m "feat: add model defaults and shared types"
```

## Task 3: CLI argument parser

**Files:**
- Create: `src/args.ts`
- Modify: `src/cli.ts`
- Test: `test/args.test.ts`

- [x] **Step 1: Write parser tests in `test/args.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("parses a default prompt", () => {
    expect(parseArgs(["Compare Next.js and Remix"])).toMatchObject({
      mode: "auto",
      profile: "quality",
      outputFormat: "brief",
      json: false,
      prompt: "Compare Next.js and Remix"
    });
  });

  it("parses subcommands", () => {
    expect(parseArgs(["research", "React Server Components"])).toMatchObject({
      mode: "research",
      prompt: "React Server Components"
    });
  });

  it("parses flags", () => {
    expect(parseArgs(["--mode", "expert", "--json", "--economy", "Prompt"])).toMatchObject({
      mode: "expert",
      profile: "economy",
      outputFormat: "brief",
      json: true,
      prompt: "Prompt"
    });
  });

  it("parses report and raw formats", () => {
    expect(parseArgs(["--report", "Prompt"])).toMatchObject({ outputFormat: "report" });
    expect(parseArgs(["--raw", "Prompt"])).toMatchObject({ outputFormat: "raw" });
  });

  it("throws for missing prompts", () => {
    expect(() => parseArgs([])).toThrow("Missing prompt");
  });
});
```

- [x] **Step 2: Run parser tests to verify failure**

Run:

```bash
pnpm test test/args.test.ts
```

Expected: FAIL because `src/args.ts` does not exist.

- [x] **Step 3: Create `src/args.ts`**

```ts
import type { CliOptions, Mode, OutputFormat, Profile } from "./types.js";

const MODES = new Set<Mode>(["auto", "fast", "expert", "research", "multi"]);

export const HELP_TEXT = `Usage:
  grok [options] <prompt>
  grok <fast|expert|research|multi> [options] <prompt>

Options:
  --mode <mode>     auto, fast, expert, research, multi
  --economy         Use economy model aliases
  --json            Emit structured JSON
  --report          Emit a longer research report
  --raw             Emit minimally shaped model output
  -h, --help        Show help
`;

export function parseArgs(argv: string[]): CliOptions {
  const tokens = [...argv];
  let mode: Mode = "auto";
  let profile: Profile = "quality";
  let outputFormat: OutputFormat = "brief";
  let json = false;
  const promptParts: string[] = [];

  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token) continue;

    if (token === "-h" || token === "--help") {
      throw new HelpRequested();
    }

    if (token === "--mode") {
      const value = tokens.shift();
      if (!isMode(value)) throw new Error(`Invalid mode: ${value ?? ""}`);
      mode = value;
      continue;
    }

    if (token === "--economy") {
      profile = "economy";
      continue;
    }

    if (token === "--json") {
      json = true;
      continue;
    }

    if (token === "--report") {
      outputFormat = "report";
      continue;
    }

    if (token === "--raw") {
      outputFormat = "raw";
      continue;
    }

    if (promptParts.length === 0 && isMode(token)) {
      mode = token;
      continue;
    }

    promptParts.push(token, ...tokens);
    break;
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Missing prompt");

  return { prompt, mode, profile, outputFormat, json };
}

function isMode(value: string | undefined): value is Mode {
  return value !== undefined && MODES.has(value as Mode);
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested");
  }
}
```

- [x] **Step 4: Replace `src/cli.ts` with parser wiring**

```ts
#!/usr/bin/env node

import { HELP_TEXT, HelpRequested, parseArgs } from "./args.js";

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(options, null, 2));
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(HELP_TEXT);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error(HELP_TEXT);
    process.exitCode = 1;
  }
}

await main();
```

- [x] **Step 5: Run parser tests and help smoke test**

Run:

```bash
pnpm test test/args.test.ts
pnpm grok --help
```

Expected: tests pass; help text prints usage and options.

- [x] **Step 6: Commit parser**

```bash
git add src/args.ts src/cli.ts test/args.test.ts
git commit -m "feat: parse grok cli arguments"
```

## Task 4: Config loading and model resolution

**Files:**
- Create: `src/config.ts`
- Modify: `test/config.test.ts`

- [x] **Step 1: Extend config tests in `test/config.test.ts`**

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { loadConfig, resolveModel } from "../src/config.js";

describe("defaults", () => {
  it("uses quality-first Grok and Sonar defaults", () => {
    expect(DEFAULT_CONFIG.defaultProfile).toBe("quality");
    expect(DEFAULT_CONFIG.models.quality.fast).toBe("x-ai/grok-4.3");
    expect(DEFAULT_CONFIG.models.quality.expert).toBe("x-ai/grok-4.20");
    expect(DEFAULT_CONFIG.models.quality.research).toBe("perplexity/sonar-pro-search");
  });
});

describe("loadConfig", () => {
  it("loads defaults and env API key", () => {
    const config = loadConfig({ env: { OPENROUTER_API_KEY: "test-openrouter-key" } });
    expect(config.openrouter.apiKey).toBe("test-openrouter-key");
    expect(config.defaultProfile).toBe("quality");
  });

  it("merges config file model overrides", () => {
    const dir = mkdtempSync(join(tmpdir(), "grok-cli-"));
    const configPath = join(dir, "config.json");
    writeFileSync(configPath, JSON.stringify({ models: { economy: { research: "perplexity/sonar" } } }));

    const config = loadConfig({ configPath, env: {} });
    expect(config.models.economy.research).toBe("perplexity/sonar");
    expect(config.models.quality.expert).toBe("x-ai/grok-4.20");
  });
});

describe("resolveModel", () => {
  it("uses profile alias", () => {
    expect(resolveModel(DEFAULT_CONFIG, "quality", "expert")).toBe("x-ai/grok-4.20");
    expect(resolveModel(DEFAULT_CONFIG, "economy", "research")).toBe("perplexity/sonar");
  });
});
```

- [x] **Step 2: Run config tests to verify failure**

Run:

```bash
pnpm test test/config.test.ts
```

Expected: FAIL because `src/config.ts` does not exist.

- [x] **Step 3: Create `src/config.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { AppConfig, ModelAlias, Profile } from "./types.js";

interface LoadConfigOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? join(homedir(), ".config", "grok-cli", "config.json");
  const fileConfig = readConfigFile(configPath);
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);

  return {
    ...merged,
    openrouter: {
      ...merged.openrouter,
      apiKey: env.OPENROUTER_API_KEY ?? merged.openrouter.apiKey
    }
  };
}

export function resolveModel(config: AppConfig, profile: Profile, alias: ModelAlias): string {
  return config.models[profile][alias];
}

function readConfigFile(path: string): Partial<AppConfig> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Partial<AppConfig>;
}

function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    defaultMode: override.defaultMode ?? base.defaultMode,
    defaultProfile: override.defaultProfile ?? base.defaultProfile,
    models: {
      quality: { ...base.models.quality, ...override.models?.quality },
      economy: { ...base.models.economy, ...override.models?.economy }
    },
    openrouter: { ...base.openrouter, ...override.openrouter }
  };
}
```

- [x] **Step 4: Run config tests and typecheck**

Run:

```bash
pnpm test test/config.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [x] **Step 5: Commit config loading**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: load grok cli config"
```

## Task 5: Cost and usage aggregation

**Files:**
- Create: `src/cost.ts`
- Test: `test/cost.test.ts`

- [x] **Step 1: Write `test/cost.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { emptyUsage, addUsageCall, formatCost } from "../src/cost.js";

describe("cost helpers", () => {
  it("accumulates token usage and costs", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "expert",
      model: "x-ai/grok-4.20",
      promptTokens: 100,
      completionTokens: 25,
      costUsd: 0.01
    });

    expect(usage.totalPromptTokens).toBe(100);
    expect(usage.totalCompletionTokens).toBe(25);
    expect(usage.costUsd).toBe(0.01);
    expect(usage.calls).toHaveLength(1);
  });

  it("leaves cost undefined when any call has unknown cost", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "expert",
      model: "x-ai/grok-4.20",
      promptTokens: 100,
      completionTokens: 25
    });

    expect(usage.costUsd).toBeUndefined();
    expect(formatCost(usage)).toBe("unavailable");
  });

  it("formats known cost", () => {
    const usage = addUsageCall(emptyUsage(), {
      role: "research",
      model: "perplexity/sonar-pro-search",
      promptTokens: 1000,
      completionTokens: 500,
      costUsd: 0.042125
    });

    expect(formatCost(usage)).toBe("$0.0421");
  });
});
```

- [x] **Step 2: Run cost tests to verify failure**

Run:

```bash
pnpm test test/cost.test.ts
```

Expected: FAIL because `src/cost.ts` does not exist.

- [x] **Step 3: Create `src/cost.ts`**

```ts
import type { UsageCall, UsageSummary } from "./types.js";

export function emptyUsage(): UsageSummary {
  return {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    calls: []
  };
}

export function addUsageCall(summary: UsageSummary, call: UsageCall): UsageSummary {
  const calls = [...summary.calls, call];
  const allCostsKnown = calls.every((item) => item.costUsd !== undefined);

  return {
    totalPromptTokens: summary.totalPromptTokens + call.promptTokens,
    totalCompletionTokens: summary.totalCompletionTokens + call.completionTokens,
    costUsd: allCostsKnown ? calls.reduce((total, item) => total + (item.costUsd ?? 0), 0) : undefined,
    calls
  };
}

export function mergeUsage(summaries: UsageSummary[]): UsageSummary {
  return summaries.reduce((merged, summary) => {
    return summary.calls.reduce((next, call) => addUsageCall(next, call), merged);
  }, emptyUsage());
}

export function formatCost(summary: UsageSummary): string {
  return summary.costUsd === undefined ? "unavailable" : `$${summary.costUsd.toFixed(4)}`;
}
```

- [x] **Step 4: Run cost tests**

Run:

```bash
pnpm test test/cost.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [x] **Step 5: Commit cost helpers**

```bash
git add src/cost.ts test/cost.test.ts
git commit -m "feat: track grok cli usage costs"
```

## Task 6: OpenRouter client

**Files:**
- Create: `src/openrouter.ts`
- Test: `test/openrouter.test.ts`

- [x] **Step 1: Write `test/openrouter.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { callOpenRouter, OpenRouterError } from "../src/openrouter.js";

describe("callOpenRouter", () => {
  it("returns content, citations, and usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "x-ai/grok-4.20",
        choices: [{ message: { content: "Answer" } }],
        citations: ["https://example.com"],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 }
      })
    });

    const result = await callOpenRouter(
      {
        apiKey: "sk-test",
        appName: "grok-cli",
        siteUrl: "https://example.com"
      },
      {
        role: "expert",
        model: "x-ai/grok-4.20",
        messages: [{ role: "user", content: "Prompt" }]
      },
      fetchMock
    );

    expect(result.content).toBe("Answer");
    expect(result.sources).toEqual([{ url: "https://example.com" }]);
    expect(result.usage.calls[0]).toMatchObject({ costUsd: 0.001, promptTokens: 10, completionTokens: 5 });
  });

  it("throws a helpful error for missing API keys", async () => {
    await expect(
      callOpenRouter(
        { appName: "grok-cli" },
        { role: "expert", model: "x-ai/grok-4.20", messages: [{ role: "user", content: "Prompt" }] },
        vi.fn()
      )
    ).rejects.toThrow("Missing OPENROUTER_API_KEY");
  });

  it("maps OpenRouter API failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Insufficient credits"
    });

    await expect(
      callOpenRouter(
        { apiKey: "sk-test", appName: "grok-cli" },
        { role: "research", model: "perplexity/sonar", messages: [{ role: "user", content: "Prompt" }] },
        fetchMock
      )
    ).rejects.toBeInstanceOf(OpenRouterError);
  });
});
```

- [x] **Step 2: Run OpenRouter tests to verify failure**

Run:

```bash
pnpm test test/openrouter.test.ts
```

Expected: FAIL because `src/openrouter.ts` does not exist.

- [x] **Step 3: Create `src/openrouter.ts`**

```ts
import { addUsageCall, emptyUsage } from "./cost.js";
import type { OpenRouterConfig, OpenRouterMessage, OpenRouterRequest, OpenRouterResponse, PipelineResult, Source } from "./types.js";

export interface OpenRouterCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

export async function callOpenRouter(
  config: OpenRouterConfig,
  call: OpenRouterCall,
  fetchImpl: typeof fetch = fetch
): Promise<PipelineResult> {
  if (!config.apiKey) {
    throw new OpenRouterError("Missing OPENROUTER_API_KEY. Set it in the environment or ~/.config/grok-cli/config.json.");
  }

  const body: OpenRouterRequest = {
    model: call.model,
    messages: call.messages,
    temperature: call.temperature,
    max_tokens: call.maxTokens,
    response_format: call.json ? { type: "json_object" } : undefined
  };

  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.siteUrl ?? "https://github.com/local/grok-cli",
      "X-Title": config.appName
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterError(`OpenRouter request failed (${response.status}): ${text}`, response.status);
  }

  const json = (await response.json()) as OpenRouterResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterError("OpenRouter response did not include message content");
  }

  const usage = addUsageCall(emptyUsage(), {
    role: call.role,
    model: json.model ?? call.model,
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    costUsd: json.usage?.cost
  });

  const sources: Source[] = (json.citations ?? []).map((url) => ({ url }));

  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "raw",
    content,
    sources,
    warnings: [],
    usage
  };
}
```

- [x] **Step 4: Run OpenRouter tests and typecheck**

Run:

```bash
pnpm test test/openrouter.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [x] **Step 5: Commit OpenRouter client**

```bash
git add src/openrouter.ts test/openrouter.test.ts
git commit -m "feat: call openrouter chat completions"
```

## Task 7: Prompts and formatters

**Files:**
- Create: `src/prompts.ts`
- Create: `src/formatters.ts`
- Test: `test/formatters.test.ts`

- [x] **Step 1: Write formatter tests in `test/formatters.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import { formatJson, formatMarkdown, formatRaw } from "../src/formatters.js";
import type { PipelineResult } from "../src/types.js";

const usage = addUsageCall(emptyUsage(), {
  role: "expert",
  model: "x-ai/grok-4.20",
  promptTokens: 100,
  completionTokens: 25,
  costUsd: 0.01
});

const result: PipelineResult = {
  mode: "expert",
  profile: "quality",
  outputFormat: "brief",
  content: "# Decision Brief\n\n## Recommendation\nUse Next.js.",
  sources: [{ url: "https://example.com" }],
  warnings: [],
  usage
};

describe("formatters", () => {
  it("adds a cost footer to markdown", () => {
    const output = formatMarkdown(result);
    expect(output).toContain("# Decision Brief");
    expect(output).toContain("Cost: $0.0100");
    expect(output).toContain("Models: x-ai/grok-4.20");
  });

  it("formats stable JSON", () => {
    const output = JSON.parse(formatJson(result));
    expect(output.mode).toBe("expert");
    expect(output.usage.cost_usd).toBe(0.01);
    expect(output.sources).toEqual([{ url: "https://example.com" }]);
  });

  it("formats raw with footer", () => {
    expect(formatRaw(result)).toContain("Use Next.js.");
    expect(formatRaw(result)).toContain("Cost: $0.0100");
  });
});
```

- [x] **Step 2: Run formatter tests to verify failure**

Run:

```bash
pnpm test test/formatters.test.ts
```

Expected: FAIL because `src/formatters.ts` does not exist.

- [x] **Step 3: Create `src/prompts.ts`**

```ts
import type { OutputFormat } from "./types.js";

export function buildSingleCallMessages(prompt: string, outputFormat: OutputFormat) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat) },
    { role: "user" as const, content: prompt }
  ];
}

export function buildResearchMessages(prompt: string, outputFormat: OutputFormat) {
  return [
    {
      role: "system" as const,
      content: `${systemPrompt(outputFormat)}\nGround every factual claim in current sources. Include citations when available.`
    },
    { role: "user" as const, content: prompt }
  ];
}

export function buildRoleAnalysisMessages(role: "engineering" | "product" | "skeptic", prompt: string, research: string) {
  const roleInstruction = {
    engineering: "Analyze engineering feasibility, implementation complexity, maintainability, ecosystem maturity, and operational risks.",
    product: "Analyze user value, business tradeoffs, adoption risk, differentiation, and roadmap implications.",
    skeptic: "Find weak assumptions, missing evidence, hidden costs, security risks, and reasons the recommendation may be wrong."
  }[role];

  return [
    { role: "system" as const, content: `You are the ${role} reviewer in a multi-agent research ensemble. ${roleInstruction}` },
    { role: "user" as const, content: `Original question:\n${prompt}\n\nGrounded research findings:\n${research}` }
  ];
}

export function buildSynthesisMessages(prompt: string, research: string, analyses: string[], outputFormat: OutputFormat) {
  return [
    { role: "system" as const, content: systemPrompt(outputFormat) },
    {
      role: "user" as const,
      content: `Original question:\n${prompt}\n\nGrounded research:\n${research}\n\nRole analyses:\n${analyses.join("\n\n---\n\n")}\n\nSynthesize the final answer.`
    }
  ];
}

function systemPrompt(outputFormat: OutputFormat): string {
  if (outputFormat === "raw") {
    return "Answer directly. Do not add unnecessary framing.";
  }

  if (outputFormat === "report") {
    return "Write a detailed research report with recommendation, background, evidence, alternatives, tradeoffs, risks, sources, and open questions.";
  }

  return "Write a concise decision brief with these sections: Recommendation, Key facts, Tradeoffs, Risks / unknowns, Sources. Be direct and useful to coding agents making technology or product decisions.";
}
```

- [x] **Step 4: Create `src/formatters.ts`**

```ts
import { formatCost } from "./cost.js";
import type { PipelineResult, UsageSummary } from "./types.js";

export function formatMarkdown(result: PipelineResult): string {
  return `${result.content.trim()}\n\n${warnings(result.warnings)}${footer(result.usage)}`.trimEnd();
}

export function formatRaw(result: PipelineResult): string {
  return `${result.content.trim()}\n\n${footer(result.usage)}`.trimEnd();
}

export function formatJson(result: PipelineResult): string {
  return JSON.stringify(
    {
      mode: result.mode,
      profile: result.profile,
      output_format: result.outputFormat,
      answer: result.answer,
      content: result.content,
      sources: result.sources,
      warnings: result.warnings,
      usage: {
        total_prompt_tokens: result.usage.totalPromptTokens,
        total_completion_tokens: result.usage.totalCompletionTokens,
        cost_usd: result.usage.costUsd,
        calls: result.usage.calls.map((call) => ({
          role: call.role,
          model: call.model,
          prompt_tokens: call.promptTokens,
          completion_tokens: call.completionTokens,
          cost_usd: call.costUsd
        }))
      }
    },
    null,
    2
  );
}

export function formatError(error: unknown, json: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (json) return JSON.stringify({ error: { message } }, null, 2);
  return `Error: ${message}`;
}

function footer(usage: UsageSummary): string {
  const models = [...new Set(usage.calls.map((call) => call.model))].join(", ") || "unavailable";
  return `---\nCost: ${formatCost(usage)} | Models: ${models} | Tokens: ${usage.totalPromptTokens.toLocaleString()} in / ${usage.totalCompletionTokens.toLocaleString()} out`;
}

function warnings(items: string[]): string {
  if (items.length === 0) return "";
  return `## Warnings\n${items.map((item) => `- ${item}`).join("\n")}\n\n`;
}
```

- [x] **Step 5: Run formatter tests and typecheck**

Run:

```bash
pnpm test test/formatters.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [x] **Step 6: Commit prompts and formatters**

```bash
git add src/prompts.ts src/formatters.ts test/formatters.test.ts
git commit -m "feat: format grok cli research output"
```

## Task 8: Mode pipelines

**Files:**
- Create: `src/modes.ts`
- Test: `test/modes.test.ts`

- [ ] **Step 1: Write `test/modes.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { runMode } from "../src/modes.js";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { addUsageCall, emptyUsage } from "../src/cost.js";
import type { PipelineResult } from "../src/types.js";

function fakeResult(role: string, model: string, content: string): PipelineResult {
  return {
    mode: "auto",
    profile: "quality",
    outputFormat: "brief",
    content,
    sources: [],
    warnings: [],
    usage: addUsageCall(emptyUsage(), { role, model, promptTokens: 10, completionTokens: 5, costUsd: 0.001 })
  };
}

describe("runMode", () => {
  it("routes expert mode to the expert model", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("expert", "x-ai/grok-4.20", "Expert answer"));
    const result = await runMode(DEFAULT_CONFIG, { prompt: "Prompt", mode: "expert", profile: "quality", outputFormat: "brief", json: false }, caller);

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "x-ai/grok-4.20", role: "expert" }));
    expect(result.content).toBe("Expert answer");
  });

  it("routes economy research to sonar", async () => {
    const caller = vi.fn().mockResolvedValue(fakeResult("research", "perplexity/sonar", "Research answer"));
    await runMode(DEFAULT_CONFIG, { prompt: "Prompt", mode: "research", profile: "economy", outputFormat: "brief", json: false }, caller);

    expect(caller).toHaveBeenCalledWith(expect.objectContaining({ model: "perplexity/sonar", role: "research" }));
  });

  it("runs multi mode research, analyses, and synthesis", async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce(fakeResult("research", "perplexity/sonar-pro-search", "Facts"))
      .mockResolvedValueOnce(fakeResult("engineering", "x-ai/grok-4.20", "Engineering"))
      .mockResolvedValueOnce(fakeResult("product", "x-ai/grok-4.20", "Product"))
      .mockResolvedValueOnce(fakeResult("skeptic", "x-ai/grok-4.20", "Skeptic"))
      .mockResolvedValueOnce(fakeResult("synthesis", "x-ai/grok-4.20", "Final"));

    const result = await runMode(DEFAULT_CONFIG, { prompt: "Prompt", mode: "multi", profile: "quality", outputFormat: "brief", json: false }, caller);

    expect(caller).toHaveBeenCalledTimes(5);
    expect(result.content).toBe("Final");
    expect(result.usage.calls).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run mode tests to verify failure**

Run:

```bash
pnpm test test/modes.test.ts
```

Expected: FAIL because `src/modes.ts` does not exist.

- [ ] **Step 3: Create `src/modes.ts`**

```ts
import { mergeUsage } from "./cost.js";
import { resolveModel } from "./config.js";
import { buildResearchMessages, buildRoleAnalysisMessages, buildSingleCallMessages, buildSynthesisMessages } from "./prompts.js";
import type { AppConfig, CliOptions, PipelineResult } from "./types.js";

interface ModeCall {
  role: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

type ModeCaller = (call: ModeCall) => Promise<PipelineResult>;

export async function runMode(config: AppConfig, options: CliOptions, caller: ModeCaller): Promise<PipelineResult> {
  if (options.mode === "multi") return runMulti(config, options, caller);

  const role = options.mode === "auto" ? "expert" : options.mode;
  const modelAlias = role === "research" ? "research" : role === "fast" ? "fast" : "expert";
  const model = resolveModel(config, options.profile, modelAlias);
  const messages = role === "research" ? buildResearchMessages(options.prompt, options.outputFormat) : buildSingleCallMessages(options.prompt, options.outputFormat);
  const result = await caller({ role, model, messages, temperature: 0.2, json: options.json });
  return { ...result, mode: options.mode, profile: options.profile, outputFormat: options.outputFormat };
}

async function runMulti(config: AppConfig, options: CliOptions, caller: ModeCaller): Promise<PipelineResult> {
  const researchModel = resolveModel(config, options.profile, "research");
  const expertModel = resolveModel(config, options.profile, "expert");

  const research = await caller({
    role: "research",
    model: researchModel,
    messages: buildResearchMessages(options.prompt, "report"),
    temperature: 0.1
  });

  const roles = ["engineering", "product", "skeptic"] as const;
  const settled = await Promise.allSettled(
    roles.map((role) =>
      caller({
        role,
        model: expertModel,
        messages: buildRoleAnalysisMessages(role, options.prompt, research.content),
        temperature: 0.2
      })
    )
  );

  const analyses = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
  const warnings = settled.flatMap((item, index) => (item.status === "rejected" ? [`${roles[index]} analysis failed: ${String(item.reason)}`] : []));

  if (analyses.length === 0) {
    throw new Error("Multi-agent mode failed because all Grok analysis roles failed");
  }

  const synthesis = await caller({
    role: "synthesis",
    model: expertModel,
    messages: buildSynthesisMessages(options.prompt, research.content, analyses.map((item) => item.content), options.outputFormat),
    temperature: 0.2,
    json: options.json
  });

  return {
    ...synthesis,
    mode: "multi",
    profile: options.profile,
    outputFormat: options.outputFormat,
    sources: [...research.sources, ...synthesis.sources],
    warnings: [...research.warnings, ...warnings, ...synthesis.warnings],
    usage: mergeUsage([research.usage, ...analyses.map((item) => item.usage), synthesis.usage])
  };
}
```

- [ ] **Step 4: Run mode tests and typecheck**

Run:

```bash
pnpm test test/modes.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit mode pipelines**

```bash
git add src/modes.ts test/modes.test.ts
git commit -m "feat: orchestrate grok cli modes"
```

## Task 9: Wire CLI end to end

**Files:**
- Modify: `src/cli.ts`
- Modify: `README.md`
- Test: existing test suite

- [ ] **Step 1: Replace `src/cli.ts` with full CLI wiring**

```ts
#!/usr/bin/env node

import { HELP_TEXT, HelpRequested, parseArgs } from "./args.js";
import { loadConfig } from "./config.js";
import { formatError, formatJson, formatMarkdown, formatRaw } from "./formatters.js";
import { callOpenRouter } from "./openrouter.js";
import { runMode } from "./modes.js";

async function main() {
  let jsonMode = false;

  try {
    const options = parseArgs(process.argv.slice(2));
    jsonMode = options.json;
    const config = loadConfig();
    const result = await runMode(config, options, (call) => callOpenRouter(config.openrouter, call));

    if (options.json) {
      console.log(formatJson(result));
    } else if (options.outputFormat === "raw") {
      console.log(formatRaw(result));
    } else {
      console.log(formatMarkdown(result));
    }
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(HELP_TEXT);
      return;
    }

    console.error(formatError(error, jsonMode));
    process.exitCode = 1;
  }
}

await main();
```

- [ ] **Step 2: Update `README.md` with final usage docs**

````md
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
````

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm grok --help
```

Expected: tests, typecheck, and build pass; help text prints.

- [ ] **Step 4: Run missing-key smoke test**

Run:

```bash
env -u OPENROUTER_API_KEY pnpm grok "Compare Next.js and Remix"
```

Expected: exits non-zero and prints a helpful missing API key message.

- [ ] **Step 5: Commit CLI wiring**

```bash
git add src/cli.ts README.md
git commit -m "feat: wire grok cli end to end"
```

## Task 10: Live smoke tests and final review

**Files:**
- Modify only if smoke tests reveal bugs.

- [ ] **Step 1: Run live help smoke test**

Run:

```bash
pnpm grok --help
```

Expected: usage text prints without requiring an API key.

- [ ] **Step 2: Run live quality fast/expert smoke test if `OPENROUTER_API_KEY` is available**

Run:

```bash
OPENROUTER_API_KEY="$OPENROUTER_API_KEY" pnpm grok --mode fast --raw "In one paragraph, what is OpenRouter?"
```

Expected: model answer prints with a cost footer.

- [ ] **Step 3: Run live research JSON smoke test if `OPENROUTER_API_KEY` is available**

Run:

```bash
OPENROUTER_API_KEY="$OPENROUTER_API_KEY" pnpm grok research --json "What is the current stable React version?"
```

Expected: valid JSON prints with `mode`, `profile`, `content`, `sources`, and `usage` fields.

- [ ] **Step 4: Run live economy multi smoke test if budget allows**

Run:

```bash
OPENROUTER_API_KEY="$OPENROUTER_API_KEY" pnpm grok multi --economy "Choose SQLite or Postgres for a small local-first CLI app"
```

Expected: decision brief prints with cost footer and any citations from the research pass.

- [ ] **Step 5: Final review checklist**

Confirm:

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- Help text documents every supported command and flag.
- Default mode is quality-first.
- `--economy` changes model aliases.
- Markdown output includes cost metadata.
- JSON output is valid JSON on success and structured JSON on expected errors.
- Multi-agent mode continues when one analysis role fails.

- [ ] **Step 6: Commit smoke-test fixes if any**

```bash
git add src test README.md package.json tsconfig.json
git commit -m "fix: polish grok cli smoke tests"
```

Skip this commit if no fixes were needed.

## Sub-agent review checkpoints

Use sub-agents before marking these groups complete:

1. **After Tasks 1-3:** Review public CLI contract, help text, command parsing, and project scaffold.
2. **After Tasks 4-6:** Review config precedence, model routing, OpenRouter request/response handling, and cost metadata.
3. **After Tasks 7-8:** Review prompts, output formats, multi-agent orchestration, and partial failure behavior.
4. **After Tasks 9-10:** Review final implementation against the design spec and verification output.

Each review should produce concrete findings. Fix blocking findings before continuing. Non-blocking improvements can be recorded for later if they are outside v1 scope.

## Self-review notes

- Spec coverage: The plan covers scaffold, command shape, model routing, config, OpenRouter calls, cost reporting, output contracts, mode behavior, multi-agent orchestration, tests, docs, and smoke tests.
- Placeholder scan: No unresolved placeholder markers, unassigned edge handling, or vague test instructions remain.
- Type consistency: Types defined in `src/types.ts` are used consistently by config, OpenRouter, formatters, and modes.
