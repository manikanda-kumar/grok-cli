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

export async function runMode(config: AppConfig, options: CliOptions, caller: ModeCaller): Promise<PipelineResult> {
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
    const model = resolveModel(config, options.profile, "deepResearch");
    const result = await caller({
      role: "deepresearch",
      model,
      messages: buildResearchMessages(options.prompt, options.outputFormat, options.json),
      temperature: 0.2,
      json: options.json,
      web: undefined,
    });
    return normalizeResult(result, options, mode, web, deprecatedWarnings);
  }

  const role = mode === "auto" ? "expert" : mode;
  const modelAlias = role === "fast" ? "fast" : "expert";
  const model = resolveModel(config, options.profile, modelAlias);
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

  const research = await caller({
    role: "research",
    model: researchModel,
    messages: buildResearchMessages(options.prompt, "report"),
    temperature: 0.1,
    web: undefined,
  });

  const roles = ["engineering", "product", "skeptic"] as const;
  const settled = await Promise.allSettled(
    roles.map((role) =>
      caller({
        role,
        model: expertModel,
        messages: buildRoleAnalysisMessages(role, options.prompt, research.content),
        temperature: 0.2,
        web: undefined,
      }),
    ),
  );

  const analyses = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
  const roleWarnings = settled.flatMap((item, index) => {
    const role = roles[index];
    return item.status === "rejected" ? [`${role} analysis failed: ${String(item.reason)}`] : [];
  });

  if (analyses.length === 0) {
    throw new Error("Multi-agent mode failed because all Grok analysis roles failed");
  }

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
    web: undefined,
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
