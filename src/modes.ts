import { canonicalizeMode, modeAllowsWeb, resolveModel, resolveWebOptions } from "./config.js";
import { mergeUsage } from "./cost.js";
import { buildResearchMessages, buildRoleAnalysisMessages, buildSingleCallMessages, buildSynthesisMessages } from "./prompts.js";
import type { AppConfig, CanonicalMode, CliOptions, DecisionAnswer, OpenRouterMessage, PipelineResult, ResolvedWebOptions } from "./types.js";

interface ModeCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  web?: ResolvedWebOptions;
}

type ModeCaller = (call: ModeCall) => Promise<PipelineResult>;

export class MaxCostExceededError extends Error {
  constructor(spentUsd: number, limitUsd: number, role: string) {
    super(`Cost $${spentUsd.toFixed(4)} exceeded limit of $${limitUsd.toFixed(4)} (aborted after "${role}")`);
    this.name = "MaxCostExceededError";
  }
}

// Wrap the caller so the pipeline aborts as soon as cumulative spend crosses --max-cost,
// preventing subsequent calls (matters most for multi's 5-call fan-out). Enforced only
// while every call so far reported a cost; otherwise the total is unknown and we let cli warn.
function withBudget(caller: ModeCaller, maxCost: number | undefined): ModeCaller {
  if (maxCost === undefined) return caller;
  let spent = 0;
  let costKnown = true;
  return async (call) => {
    // Pre-check: if a prior stage already blew the budget, don't fire this call.
    if (costKnown && spent > maxCost) throw new MaxCostExceededError(spent, maxCost, call.role);
    const result = await caller(call);
    if (result.usage.costUsd === undefined) costKnown = false;
    else spent += result.usage.costUsd;
    if (costKnown && spent > maxCost) throw new MaxCostExceededError(spent, maxCost, call.role);
    return result;
  };
}

// Sequential analog of Promise.allSettled that stops as soon as a leg aborts on budget,
// so no further (billable) legs are dispatched once --max-cost is crossed.
async function runSequential<T extends string>(
  roles: readonly T[],
  run: (role: T) => Promise<PipelineResult>,
): Promise<PromiseSettledResult<PipelineResult>[]> {
  const results: PromiseSettledResult<PipelineResult>[] = [];
  for (const role of roles) {
    try {
      results.push({ status: "fulfilled", value: await run(role) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
      if (reason instanceof MaxCostExceededError) break;
    }
  }
  return results;
}

export async function runMode(config: AppConfig, options: CliOptions, rawCaller: ModeCaller): Promise<PipelineResult> {
  const caller = withBudget(rawCaller, options.maxCost);
  const { mode, warnings: modeWarnings } = canonicalizeMode(options.mode);
  const web = resolveWebOptions(config, mode, options.web);
  const deprecatedWarnings = [
    ...modeWarnings,
    ...(options.web.deprecatedWebFlag ? ['Flag "--web" is deprecated; web search is on by default. Use --no-web to disable.'] : []),
  ];

  if (options.mode === "multi") {
    return runMulti(config, options, mode, web, deprecatedWarnings, caller);
  }

  if (mode === "deepresearch") {
    if (!options.json) console.error("Step 1/1: Researching...");
    const model = resolveModel(config, options.profile, "deepResearch");
    const result = await caller({
      role: "deepresearch",
      model,
      messages: buildResearchMessages(options.prompt, options.outputFormat, options.json),
      temperature: 0.2,
      json: options.json,
    });
    return normalizeResult(result, options, mode, web, deprecatedWarnings);
  }

  const role = mode === "auto" ? "expert" : mode;
  const modelAlias = role === "fast" ? "fast" : "expert";
  const model = resolveModel(config, options.profile, modelAlias);
  if (!options.json) {
    const webStatus = web.searchEnabled ? " (web search enabled)" : "";
    console.error(`Step 1/1: Calling ${modelAlias} model${webStatus}...`);
  }
  const result = await caller({
    role,
    model,
    messages: buildSingleCallMessages(options.prompt, options.outputFormat, options.json, web.searchEnabled),
    temperature: 0.2,
    json: options.json,
    web,
  });
  return normalizeResult(result, options, mode, web, deprecatedWarnings);
}

async function runMulti(
  config: AppConfig,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  warnings: string[],
  caller: ModeCaller,
): Promise<PipelineResult> {
  const researchModel = resolveModel(config, options.profile, "research");
  const expertModel = resolveModel(config, options.profile, "expert");

  if (!options.json) console.error("Step 1/3: Researching grounded facts...");
  const research = await caller({
    role: "research",
    model: researchModel,
    messages: buildResearchMessages(options.prompt, "report"),
    temperature: 0.1,
  });

  const roles = ["engineering", "product", "skeptic"] as const;
  if (!options.json) console.error(`Step 2/3: Analyzing perspectives (${roles.join(", ")})...`);
  const runLeg = (role: (typeof roles)[number]) =>
    caller({
      role,
      model: expertModel,
      messages: buildRoleAnalysisMessages(role, options.prompt, research.content),
      temperature: 0.2,
    });

  // Parallel by default for latency. With --max-cost, run legs sequentially so the budget
  // pre-check can stop dispatching the moment the cap is crossed (no concurrent overspend).
  const settled =
    options.maxCost === undefined
      ? await Promise.allSettled(roles.map(runLeg))
      : await runSequential(roles, runLeg);

  // A budget abort in any leg is fatal for the run — surface it instead of demoting to a warning.
  const budgetHit = settled.find((item) => item.status === "rejected" && item.reason instanceof MaxCostExceededError);
  if (budgetHit?.status === "rejected") throw budgetHit.reason;

  const analyses = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
  const roleWarnings = settled.flatMap((item, index) => {
    const role = roles[index];
    return item.status === "rejected" ? [`${role} analysis failed: ${String(item.reason)}`] : [];
  });

  if (analyses.length === 0) {
    throw new Error("Multi-agent mode failed because all Grok analysis roles failed");
  }

  if (!options.json) console.error("Step 3/3: Synthesizing final answer...");
  const synthesis = await caller({
    role: "synthesis",
    model: expertModel,
    messages: buildSynthesisMessages(
      options.prompt,
      research.content,
      analyses.map((item) => item.content),
      options.outputFormat,
      research.sources.map((source) => source.url),
      options.json,
    ),
    temperature: 0.2,
    json: options.json,
  });

  return normalizeResult(
    {
      ...synthesis,
      mode: "multi",
      profile: options.profile,
      outputFormat: options.outputFormat,
      sources: [...research.sources, ...synthesis.sources],
      warnings: [...research.warnings, ...roleWarnings, ...synthesis.warnings],
      usage: mergeUsage([research.usage, ...analyses.map((item) => item.usage), synthesis.usage]),
    },
    options,
    mode,
    web,
    warnings,
  );
}

function normalizeResult(
  result: PipelineResult,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  extraWarnings: string[],
): PipelineResult {
  const normalized: PipelineResult = {
    ...result,
    mode,
    profile: options.profile,
    outputFormat: options.outputFormat,
    warnings: dedupeWarnings([...extraWarnings, ...result.warnings]),
    ...(modeAllowsWeb(mode)
      ? {
          web: {
            searchEnabled: web.searchEnabled,
            fetchEnabled: web.fetchEnabled,
          },
        }
      : {
          web: {
            searchEnabled: false,
            fetchEnabled: false,
          },
        }),
  };

  if (options.json) {
    normalized.answer = parseDecisionAnswer(result.content);
  }

  return normalized;
}

function parseDecisionAnswer(content: string): DecisionAnswer {
  const parsed = JSON.parse(content) as Partial<{
    recommendation: unknown;
    key_facts: unknown;
    tradeoffs: unknown;
    risks: unknown;
    open_questions: unknown;
    confidence: unknown;
  }>;

  return {
    recommendation: stringValue(parsed.recommendation),
    keyFacts: stringArray(parsed.key_facts),
    tradeoffs: stringArray(parsed.tradeoffs),
    risks: stringArray(parsed.risks),
    openQuestions: stringArray(parsed.open_questions),
    confidence: parsed.confidence === "low" || parsed.confidence === "high" ? parsed.confidence : "medium",
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}
