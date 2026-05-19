import { mergeUsage } from "./cost.js";
import { resolveModel } from "./config.js";
import { buildResearchMessages, buildRoleAnalysisMessages, buildSingleCallMessages, buildSynthesisMessages } from "./prompts.js";
import type { AppConfig, CliOptions, DecisionAnswer, OpenRouterMessage, PipelineResult } from "./types.js";

interface ModeCall {
  role: string;
  model: string;
  messages: OpenRouterMessage[];
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
  const messages = role === "research" ? buildResearchMessages(options.prompt, options.outputFormat, options.json) : buildSingleCallMessages(options.prompt, options.outputFormat, options.json);
  const result = await caller({ role, model, messages, temperature: 0.2, json: options.json });
  return normalizeResult(result, options);
}

async function runMulti(config: AppConfig, options: CliOptions, caller: ModeCaller): Promise<PipelineResult> {
  const researchModel = resolveModel(config, options.profile, "research");
  const expertModel = resolveModel(config, options.profile, "expert");

  const research = await caller({
    role: "research",
    model: researchModel,
    messages: buildResearchMessages(options.prompt, "report"),
    temperature: 0.1,
  });

  const roles = ["engineering", "product", "skeptic"] as const;
  const settled = await Promise.allSettled(
    roles.map((role) =>
      caller({
        role,
        model: expertModel,
        messages: buildRoleAnalysisMessages(role, options.prompt, research.content),
        temperature: 0.2,
      }),
    ),
  );

  const analyses = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));
  const warnings = settled.flatMap((item, index) => {
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
  });

  return normalizeResult({
    ...synthesis,
    mode: "multi",
    profile: options.profile,
    outputFormat: options.outputFormat,
    sources: [...research.sources, ...synthesis.sources],
    warnings: [...research.warnings, ...warnings, ...synthesis.warnings],
    usage: mergeUsage([research.usage, ...analyses.map((item) => item.usage), synthesis.usage]),
  }, options);
}

function normalizeResult(result: PipelineResult, options: CliOptions): PipelineResult {
  const normalized: PipelineResult = {
    ...result,
    mode: options.mode,
    profile: options.profile,
    outputFormat: options.outputFormat,
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
