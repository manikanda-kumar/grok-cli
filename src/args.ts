import type { CliOptions, CliWebOverrides, Mode, OutputStyle, WebProvider } from "./types.js";

import { basename } from "node:path";

const MODES = new Set<Mode>(["auto", "fast", "expert", "deepresearch", "research", "multi", "retrieve"]);

const OUTPUT_STYLES = new Set<OutputStyle>(["brief", "results", "both"]);

const WEB_PROVIDERS = new Set<WebProvider>(["openrouter"]);

const PROGRAM_NAME =
  process.env.GROK_PROGRAM_NAME ||
  basename(process.argv[1] || "grok").replace(/\.(js|ts)$/, "") ||
  "grok";

export const HELP_TEXT = `Usage:
  ${PROGRAM_NAME} [options] <prompt>
  ${PROGRAM_NAME} <auto|fast|expert|deepresearch|research|multi|retrieve> [options] <prompt>

Modes:
  auto, fast, expert     Grok with OpenRouter web search on by default
  deepresearch         Sonar deep research (no OpenRouter web tools)
  research             Deprecated alias for deepresearch
  multi                Sonar research + Grok ensemble (no web on Grok legs)
  retrieve             Retrieval-first mode: Tavily-style results[] from web search

Options:
  --mode <mode>              Same as positional mode
  --retrieve                 Force retrieval-focused output (results[] in --json)
  --output <style>           Output shape: brief (default), results, both
  --schema <json|file>       Constrain JSON output to a JSON Schema (inline or file path)
  --web-provider <provider>  Web retrieval provider: openrouter (default)
  --no-web                   Disable OpenRouter web search for this run
  --web                      Deprecated no-op (web search is on by default)
  --web-fetch                Also enable openrouter:web_fetch (Grok modes only)
  --web-engine <engine>      Web search engine: auto, exa, etc. (default: auto)
  --web-max-results <n>      Max results per search (default: 5)
  --web-max-total-results <n>  Cap total search results (default: 10)
  --web-allowed-domains <d>  Comma-separated allowed domains
  --web-blocked-domains <d>  Comma-separated blocked domains
  --economy                  Use economy model aliases
  --json                     Emit structured JSON (compatible with web tools)
  --report                   Emit a longer research report
  --raw                      Emit minimally shaped model output
  --max-cost <n>             Error if total cost exceeds <n> USD
  -h, --help                 Show help

Examples for agents:
  # Decision brief (default): recommendation, tradeoffs, risks, sources
  grok "Bun vs Node for a CLI tool"
  grok expert --json "Compare Postgres vs MySQL for small teams"

  # Cheapest fast answer (no web needed for timeless topics)
  grok fast --no-web --raw "One sentence: what is a mutex?"

  # Deep factual research with citations (Sonar, not Grok)
  grok deepresearch "Latest stable Node.js LTS version as of 2026"

  # Multi-perspective ensemble (Sonar facts + 3 Grok roles + synthesis)
  grok multi "Redis or Memcached for session cache only"

  # Tavily-style retrieval: results[] with title, url, content, score
  grok retrieve --json "latest React 19 patterns"
  grok expert --retrieve --json "latest Bun vs Deno benchmarks"

  # Retrieve raw results, then synthesize a brief in one run (2 calls)
  grok expert --output both --json "compare Postgres vs MySQL for small teams"

  # Structured output constrained to your JSON Schema (schema_result in --json)
  grok expert --schema '{"type":"object","properties":{"winner":{"type":"string"},"reason":{"type":"string"}}}' --json "Go vs Rust for a CLI"

  # Ground answers in specific domains (e.g. official docs + X/Twitter)
  grok expert --web-allowed-domains developer.mozilla.org,x.com "what's new in CSS nesting?"

Sample --json output (default brief mode):
  {
    "mode": "expert",
    "web": { "search_enabled": true, "fetch_enabled": false },
    "profile": "quality",
    "output_format": "brief",
    "answer": {
      "recommendation": "Use Bun for a new CLI tool.",
      "key_facts": ["Bun starts faster than Node.", "Single binary, no runtime deps."],
      "tradeoffs": ["Smaller ecosystem than Node."],
      "risks": ["Young project, API churn risk."],
      "open_questions": ["Does it support your needed Node APIs?"],
      "confidence": "medium"
    },
    "content": "{ \\"recommendation\\": \\"Use Bun...\\", ... }",
    "sources": [
      { "url": "https://bun.sh/docs" },
      { "url": "https://x.com/bunjavascript", "title": "Bun on X" }
    ],
    "warnings": [],
    "usage": {
      "total_prompt_tokens": 2100,
      "total_completion_tokens": 800,
      "cost_usd": 0.012,
      "server_tool_use": { "web_search_requests": 2 },
      "calls": [
        { "role": "expert", "model": "x-ai/grok-4.20", "prompt_tokens": 2100, "completion_tokens": 800, "cost_usd": 0.012, "server_tool_use": { "web_search_requests": 2 } }
      ]
    }
  }

Sample --json output (retrieve mode):
  {
    "mode": "retrieve",
    "web": { "search_enabled": true, "fetch_enabled": true },
    "profile": "quality",
    "output_format": "brief",
    "answer": null,
    "content": "",
    "sources": [{ "url": "https://react.dev/blog" }],
    "search_results": [
      { "title": "React 19 Patterns", "url": "https://react.dev/blog", "content": "React 19 adds use() hook and Actions.", "score": 1.0 },
      { "title": "Patterns Guide", "url": "https://example.com/patterns", "content": "Common React 19 patterns summary.", "score": 0.5 }
    ],
    "warnings": [],
    "usage": { "total_prompt_tokens": 1800, "total_completion_tokens": 300, "cost_usd": 0.008, "calls": [ ... ] }
  }

Sample --json output (--schema mode):
  {
    "mode": "expert",
    "web": { "search_enabled": true, "fetch_enabled": false },
    "profile": "quality",
    "output_format": "brief",
    "answer": null,
    "content": "{ \\"winner\\": \\"Go\\", \\"reason\\": \\"Faster compilation...\\" }",
    "sources": [{ "url": "https://go.dev" }],
    "schema_result": { "winner": "Go", "reason": "Faster compilation and simpler deploy story for CLIs." },
    "warnings": [],
    "usage": { "total_prompt_tokens": 1500, "total_completion_tokens": 120, "cost_usd": 0.006, "calls": [ ... ] }
  }

Agent tips:
  - Use --json for structured parsing; errors are JSON on stderr (exit code 1).
  - Use --no-web for static/cheap prompts (web adds ~1.8k token overhead even with 0 searches).
  - Use retrieve --json when you need raw results for RAG, not a synthesized answer.
  - Use --schema when you need typed output matching your own JSON Schema.
  - Use --max-cost to cap spend, especially for multi (5 calls) or --output both (2 calls).
`;

export function parseArgs(argv: string[]): CliOptions {
  const tokens = [...argv];
  let mode: Mode = "auto";
  let modeExplicit = false;
  let profile: CliOptions["profile"] = "quality";
  let profileExplicit = false;
  let outputFormat: CliOptions["outputFormat"] = "brief";
  let outputStyle: OutputStyle = "brief";
  let retrieve = false;
  let schema: string | undefined;
  let webProvider: WebProvider = "openrouter";
  let json = false;
  let maxCost: number | undefined;
  const web = emptyWebOverrides();
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
      modeExplicit = true;
      continue;
    }

    if (token === "--retrieve") {
      retrieve = true;
      continue;
    }

    if (token === "--output") {
      const value = tokens.shift();
      if (!isOutputStyle(value)) throw new Error(`Invalid --output style: ${value ?? ""}`);
      outputStyle = value;
      continue;
    }

    if (token === "--schema") {
      schema = requireValue(token, tokens.shift());
      continue;
    }

    if (token === "--web-provider") {
      const value = tokens.shift();
      if (!isWebProvider(value)) throw new Error(`Invalid --web-provider: ${value ?? ""}`);
      webProvider = value;
      continue;
    }

    if (token === "--no-web") {
      web.noWeb = true;
      continue;
    }

    if (token === "--web") {
      web.deprecatedWebFlag = true;
      continue;
    }

    if (token === "--web-fetch") {
      web.fetchFlag = true;
      continue;
    }

    if (token === "--web-engine") {
      web.engine = requireValue(token, tokens.shift());
      continue;
    }

    if (token === "--web-max-results") {
      web.maxResults = parsePositiveInt(requireValue(token, tokens.shift()), token);
      continue;
    }

    if (token === "--web-max-total-results") {
      web.maxTotalResults = parsePositiveInt(requireValue(token, tokens.shift()), token);
      continue;
    }

    if (token === "--web-allowed-domains") {
      web.allowedDomains = parseDomainList(requireValue(token, tokens.shift()));
      continue;
    }

    if (token === "--web-blocked-domains") {
      web.blockedDomains = parseDomainList(requireValue(token, tokens.shift()));
      continue;
    }

    if (token === "--economy") {
      profile = "economy";
      profileExplicit = true;
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

    if (token === "--") {
      promptParts.push(...tokens);
      break;
    }

    if (promptParts.length === 0 && isMode(token)) {
      mode = token;
      modeExplicit = true;
      continue;
    }

    if (token === "--max-cost") {
      const value = tokens.shift();
      const parsed = Number.parseFloat(requireValue(token, value));
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid value for --max-cost: ${value}`);
      maxCost = parsed;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    promptParts.push(token, ...tokens);
    break;
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Missing prompt");

  return {
    prompt,
    mode,
    modeExplicit,
    profile,
    profileExplicit,
    outputFormat,
    outputStyle,
    retrieve,
    ...(schema === undefined ? {} : { schema }),
    webProvider,
    json,
    web,
    ...(maxCost === undefined ? {} : { maxCost }),
  };
}

export function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

function emptyWebOverrides(): CliWebOverrides {
  return { noWeb: false, deprecatedWebFlag: false, fetchFlag: false };
}

function isMode(value: string | undefined): value is Mode {
  return value !== undefined && MODES.has(value as Mode);
}

function isOutputStyle(value: string | undefined): value is OutputStyle {
  return value !== undefined && OUTPUT_STYLES.has(value as OutputStyle);
}

function isWebProvider(value: string | undefined): value is WebProvider {
  return value !== undefined && WEB_PROVIDERS.has(value as WebProvider);
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid value for ${flag}: ${value}`);
  return parsed;
}

function parseDomainList(value: string): string[] {
  const domains = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (domains.length === 0) throw new Error("Domain list must not be empty");
  return domains;
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested");
  }
}
