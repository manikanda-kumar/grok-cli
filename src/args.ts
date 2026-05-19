import type { CliOptions, Mode, OutputFormat, Profile } from "./types.js";

const MODES = new Set<Mode>(["auto", "fast", "expert", "research", "multi"]);

export const HELP_TEXT = `Usage:
  grok [options] <prompt>
  grok <auto|fast|expert|research|multi> [options] <prompt>

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
  let modeExplicit = false;
  let profile: Profile = "quality";
  let profileExplicit = false;
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
      modeExplicit = true;
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

  return { prompt, mode, modeExplicit, profile, profileExplicit, outputFormat, json };
}

export function wantsJson(argv: string[]): boolean {
  return argv.includes("--json");
}

function isMode(value: string | undefined): value is Mode {
  return value !== undefined && MODES.has(value as Mode);
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested");
  }
}
