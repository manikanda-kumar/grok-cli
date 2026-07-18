import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { XNetworkMode, XSignalOptions, XSignalResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TURNS = 30;

const X_SIGNAL_START = "## X_SIGNAL_MARKDOWN";
const X_SIGNAL_END = "## END_X_SIGNAL";

export class XSignalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "XSignalError";
  }
}

/** Build the headless prompt that forces /whathappened + a machine-readable block. */
export function buildWhathappenedPrompt(topic: string, network: XNetworkMode = "off"): string {
  const networkLine =
    network === "off"
      ? "Network filter: OFF (global X)."
      : network === "prefer"
        ? "Network filter: ON · prefer (boost people the user follows / list members when relevant)."
        : "Network filter: ON · strict (only people the user follows / list members, except official origin).";

  return [
    `/whathappened ${topic}`,
    "",
    "You are running the **whathappened** skill for grok-research consolidation.",
    "Follow ~/.grok/skills/whathappened/SKILL.md (and its references/) for the full X pipeline.",
    "",
    "Hard rules for this invocation:",
    "- Use native X tools only for public opinion and event narrative (x_keyword_search, x_semantic_search, x_thread_fetch, x_user_search).",
    "- Do not invent posts, handles, engagement, or URLs.",
    "- Soft web exception: at most one web lookup for entity identity only.",
    `- ${networkLine}`,
    "- Write the HTML report as the skill requires (path under whathappened-reports/).",
    "",
    "After the short chat TL;DR, emit EXACTLY this machine-readable block (required):",
    X_SIGNAL_START,
    "Self-contained markdown covering:",
    "- Window / mode / confidence / network mode",
    "- What happened (2-5 sentences)",
    "- Conversation frames",
    "- Opinion map (camps; rough)",
    "- Receipts: 5-10 items with @handle and https://x.com/.../status/... when known",
    "- Gaps",
    "Keep the block under ~1500 words. No invented links.",
    X_SIGNAL_END,
    "",
    `Topic: ${topic}`,
  ].join("\n");
}

/** Extract the X_SIGNAL_MARKDOWN block, or fall back to full text. */
export function parseXSignalText(rawText: string): { markdown: string; reportPath?: string; usedFallback: boolean } {
  const start = rawText.indexOf(X_SIGNAL_START);
  const end = rawText.indexOf(X_SIGNAL_END);
  let markdown: string;
  let usedFallback = false;

  if (start !== -1 && end !== -1 && end > start) {
    markdown = rawText.slice(start + X_SIGNAL_START.length, end).trim();
  } else {
    markdown = rawText.trim();
    usedFallback = true;
  }

  const reportPath = extractReportPath(rawText);
  return reportPath === undefined ? { markdown, usedFallback } : { markdown, reportPath, usedFallback };
}

export function extractReportPath(text: string): string | undefined {
  // **Report:** /abs/path.html  or Report: path
  const labeled = text.match(/\*\*Report:\*\*\s*(\S+\.html)/i) ?? text.match(/Report:\s*(\S+\.html)/i);
  if (labeled?.[1]) return labeled[1];

  const free = text.match(/(?:^|\s)((?:\/|\.\/|~\/)[^\s]*whathappened[^\s]*\.html)/i);
  return free?.[1];
}

export function resolveGrokBinary(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  if (env.GROK_BIN && env.GROK_BIN.trim()) return env.GROK_BIN.trim();

  const candidates = [
    join(homedir(), ".grok", "bin", "grok"),
    "/usr/local/bin/grok",
    "/opt/homebrew/bin/grok",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return "grok"; // rely on PATH
}

/**
 * Invoke Grok agent headless to run /whathappened and return structured X signal.
 * Requires Grok Build auth + native X tools (not OPENROUTER / XAI_API_KEY).
 */
export async function fetchXSignal(
  options: XSignalOptions,
  deps: {
    spawnImpl?: typeof spawn;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  } = {},
): Promise<XSignalResult> {
  const env = deps.env ?? process.env;
  const warnings: string[] = [];

  // Prevent accidental recursive grok-research --x inside a nested grok --x spawn.
  if (env.GROK_RESEARCH_X_ACTIVE === "1") {
    throw new XSignalError(
      "Nested --x is disabled (GROK_RESEARCH_X_ACTIVE=1). When already inside Grok Build, run /whathappened natively and consolidate — do not shell grok-research --x.",
    );
  }

  const network = options.network ?? "off";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const grokBin = options.grokBin ?? resolveGrokBinary(env);
  const prompt = buildWhathappenedPrompt(options.topic, network);

  const args = [
    "-p",
    prompt,
    "--always-approve",
    "--output-format",
    "json",
    "--max-turns",
    String(maxTurns),
  ];

  if (!options.jsonQuiet) {
    console.error(`X signal: invoking Grok agent (${grokBin}) for /whathappened...`);
  }

  const spawnImpl = deps.spawnImpl ?? spawn;
  const childEnv = {
    ...env,
    GROK_RESEARCH_X_ACTIVE: "1",
  };

  const { stdout, stderr, code, signal } = await runProcess(spawnImpl, grokBin, args, {
    env: childEnv as NodeJS.ProcessEnv,
    timeoutMs,
  });

  if (code !== 0 && !stdout.trim()) {
    const detail = stderr.trim() || signal || `exit ${code}`;
    throw new XSignalError(
      `Grok agent /whathappened failed (${detail}). Ensure \`grok\` is installed, authenticated, and native X tools are available. Nested agents should run /whathappened in-session instead of --x.`,
    );
  }

  const { text, sessionId, costUsd, parseWarnings } = parseGrokHeadlessJson(stdout, stderr);
  warnings.push(...parseWarnings);

  if (!text.trim()) {
    throw new XSignalError("Grok agent returned empty text for /whathappened.");
  }

  const parsed = parseXSignalText(text);
  if (parsed.usedFallback) {
    warnings.push("X signal marker block missing; used full Grok reply as X markdown.");
  }
  if (code !== 0) {
    warnings.push(`Grok agent exited with code ${code}; partial X signal may be incomplete.`);
  }

  const result: XSignalResult = {
    markdown: parsed.markdown,
    rawText: text,
    warnings,
  };
  if (parsed.reportPath !== undefined) result.reportPath = parsed.reportPath;
  if (sessionId !== undefined) result.sessionId = sessionId;
  if (costUsd !== undefined) result.costUsd = costUsd;
  return result;
}

function parseGrokHeadlessJson(
  stdout: string,
  stderr: string,
): { text: string; sessionId?: string; costUsd?: number; parseWarnings: string[] } {
  const parseWarnings: string[] = [];
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { text: stderr.trim(), parseWarnings: ["Grok stdout empty; fell back to stderr."] };
  }

  // Prefer last JSON object line (streaming-json may emit multiple; plain json is one object).
  const candidates = extractJsonCandidates(trimmed);
  for (const candidate of candidates.reverse()) {
    try {
      const obj = JSON.parse(candidate) as {
        text?: unknown;
        result?: unknown;
        sessionId?: unknown;
        total_cost_usd?: unknown;
        totalCostUsd?: unknown;
      };
      const text =
        typeof obj.text === "string"
          ? obj.text
          : typeof obj.result === "string"
            ? obj.result
            : undefined;
      if (text !== undefined) {
        const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : undefined;
        const costRaw = obj.total_cost_usd ?? obj.totalCostUsd;
        const costUsd = typeof costRaw === "number" && Number.isFinite(costRaw) ? costRaw : undefined;
        return {
          text,
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(costUsd === undefined ? {} : { costUsd }),
          parseWarnings,
        };
      }
    } catch {
      // try next candidate
    }
  }

  parseWarnings.push("Could not parse Grok --output-format json; treating stdout as plain text.");
  return { text: trimmed, parseWarnings };
}

function extractJsonCandidates(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const objects = lines.filter((l) => l.startsWith("{") && l.endsWith("}"));
  if (objects.length > 0) return objects;
  // Whole stdout might be one pretty-printed JSON object
  if (text.trimStart().startsWith("{")) return [text.trim()];
  return [];
}

function runProcess(
  spawnImpl: typeof spawn,
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
      reject(new XSignalError(`Grok agent timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new XSignalError(
          `Failed to spawn Grok agent (${command}): ${error.message}. Install/authenticate grok or set GROK_BIN.`,
          { cause: error },
        ),
      );
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal });
    });
  });
}
