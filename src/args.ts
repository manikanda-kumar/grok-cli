import type { CliOptions, CliWebOverrides, Mode } from "./types.js";

const MODES = new Set<Mode>(["auto", "fast", "expert", "deepresearch", "research", "multi"]);

export const HELP_TEXT = `Usage:
  grok [options] <prompt>
  grok <auto|fast|expert|deepresearch|research|multi> [options] <prompt>

Modes:
  auto, fast, expert     Grok with OpenRouter web search on by default
  deepresearch         Sonar deep research (no OpenRouter web tools)
  research             Deprecated alias for deepresearch
  multi                Sonar research + Grok ensemble (no web on Grok legs)

Options:
  --mode <mode>              Same as positional mode
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
  -h, --help                 Show help
`;

export function parseArgs(argv: string[]): CliOptions {
  const tokens = [...argv];
  let mode: Mode = "auto";
  let modeExplicit = false;
  let profile: CliOptions["profile"] = "quality";
  let profileExplicit = false;
  let outputFormat: CliOptions["outputFormat"] = "brief";
  let json = false;
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

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    promptParts.push(token, ...tokens);
    break;
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) throw new Error("Missing prompt");

  return { prompt, mode, modeExplicit, profile, profileExplicit, outputFormat, json, web };
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
