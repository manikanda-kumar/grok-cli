import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { canonicalizeMode, modeAllowsWeb, resolveModel, resolveWebOptions } from "./config.js";
import { emptyUsage, mergeUsage } from "./cost.js";
import {
  buildJsonFromResearchMessages,
  buildResearchMessages,
  buildRoleAnalysisMessages,
  buildSchemaFromResearchMessages,
  buildSchemaMessages,
  buildSingleCallMessages,
  buildSynthesisMessages,
  buildRetrieveMessages,
} from "./prompts.js";
import { mergeRetrieveResults, parseRetrieveContent } from "./retrieval.js";
import type {
  AppConfig,
  CanonicalMode,
  CliOptions,
  DecisionAnswer,
  OpenRouterMessage,
  PipelineResult,
  ResolvedWebOptions,
  SearchResult,
  XSignalResult,
} from "./types.js";
import { fetchXSignal } from "./x-signal.js";

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

  // Optional: native X signal via Grok agent /whathappened (before web research).
  let xSignal: XSignalResult | undefined;
  if (options.x.enabled) {
    xSignal = await fetchXSignal({
      topic: options.prompt,
      network: options.x.network,
      ...(options.x.timeoutMs === undefined ? {} : { timeoutMs: options.x.timeoutMs }),
      ...(options.x.maxTurns === undefined ? {} : { maxTurns: options.x.maxTurns }),
      jsonQuiet: options.json,
    });
    deprecatedWarnings.push(...xSignal.warnings);
  }

  if (options.x.only) {
    return buildXOnlyResult(options, mode, web, deprecatedWarnings, xSignal);
  }

  const xMarkdown = xSignal?.markdown;

  // Schema-guided output: takes over the single-call path regardless of mode.
  // When web is on, use two-pass (research with tools, then schema format without)
  // so we never combine response_format json_object with server tools.
  if (options.schema !== undefined) {
    const schemaWarnings = [...deprecatedWarnings];
    if (mode === "deepresearch" || mode === "multi") {
      schemaWarnings.push(`--schema overrides ${options.modeExplicit ? options.mode : `"${options.mode}"`} mode; using a single Grok call with schema-constrained output instead.`);
    }
    const schemaJson = loadSchema(options.schema);
    const model = resolveModel(config, options.profile, mode === "fast" ? "fast" : "expert");
    const schemaPrompt = withXInSchemaPrompt(options.prompt, xMarkdown);

    if (web.searchEnabled) {
      if (!options.json) console.error(`Step 1/2: Researching with web search (${model})...`);
      const research = await caller({
        role: "schema_research",
        model,
        messages: buildSingleCallMessages(schemaPrompt, "report", false, true, xMarkdown),
        temperature: 0.2,
        web,
      });
      if (!options.json) console.error("Step 2/2: Formatting to schema JSON...");
      const formatted = await caller({
        role: "schema",
        model,
        messages: buildSchemaFromResearchMessages(
          schemaPrompt,
          research.content,
          schemaJson,
          research.sources.map((s) => s.url),
        ),
        temperature: 0.1,
        json: true,
      });
      const merged = {
        ...formatted,
        sources: [...research.sources, ...formatted.sources],
        warnings: [...research.warnings, ...formatted.warnings],
        usage: mergeUsage([research.usage, formatted.usage]),
      };
      return attachXSignal(normalizeSchemaResult(merged, options, mode, web, schemaWarnings), xSignal);
    }

    if (!options.json) console.error(`Step 1/1: Generating schema-constrained output (${model})...`);
    const result = await caller({
      role: "schema",
      model,
      messages: buildSchemaMessages(schemaPrompt, schemaJson),
      temperature: 0.1,
      json: true,
      web,
    });
    return attachXSignal(normalizeSchemaResult(result, options, mode, web, schemaWarnings), xSignal);
  }

  if (options.mode === "multi") {
    return attachXSignal(await runMulti(config, options, mode, web, deprecatedWarnings, caller, xMarkdown), xSignal);
  }

  // Retrieve mode (or --retrieve / --output results|both on a Grok mode): run a
  // retrieval-focused call that emits Tavily-style results[].
  const retrieveRequested = mode === "retrieve" || options.retrieve || options.outputStyle !== "brief";
  if (retrieveRequested && modeAllowsWeb(mode)) {
    return attachXSignal(await runRetrieve(config, options, mode, web, deprecatedWarnings, caller, xMarkdown), xSignal);
  }
  if (retrieveRequested && !modeAllowsWeb(mode)) {
    // --retrieve / --output results|both was requested on a non-web mode
    // (deepresearch or multi). Surface a warning so agents know it was ignored.
    deprecatedWarnings.push(
      `--retrieve/--output was ignored in ${options.modeExplicit ? options.mode : `"${options.mode}"`} mode; this mode does not use OpenRouter web tools.`,
    );
  }

  if (mode === "deepresearch") {
    // Sonar has no OpenRouter web tools; single-pass JSON is fine.
    if (!options.json) console.error("Step 1/1: Researching...");
    const model = resolveModel(config, options.profile, "deepResearch");
    const result = await caller({
      role: "deepresearch",
      model,
      messages: buildResearchMessages(options.prompt, options.outputFormat, options.json, xMarkdown),
      temperature: 0.2,
      json: options.json,
    });
    return attachXSignal(normalizeResult(result, options, mode, web, deprecatedWarnings), xSignal);
  }

  const role = mode === "auto" ? "expert" : mode;
  const modelAlias = role === "fast" ? "fast" : "expert";
  const model = resolveModel(config, options.profile, modelAlias);

  // --json + web: two-pass. Grok + response_format json_object + web_search often
  // returns invalid minimal JSON (e.g. "-1.5e-05") after heavy search context.
  if (options.json && web.searchEnabled) {
    console.error(`Step 1/2: Researching with web search (${modelAlias})...`);
    const research = await caller({
      role,
      model,
      messages: buildSingleCallMessages(options.prompt, options.outputFormat === "raw" ? "brief" : options.outputFormat, false, true, xMarkdown),
      temperature: 0.2,
      web,
    });
    console.error("Step 2/2: Formatting decision JSON (no web tools)...");
    const formatted = await caller({
      role: "json_format",
      model,
      messages: buildJsonFromResearchMessages(
        options.prompt,
        research.content,
        research.sources.map((s) => s.url),
      ),
      temperature: 0.1,
      json: true,
    });
    const merged = {
      ...formatted,
      sources: [...research.sources, ...formatted.sources],
      warnings: [
        ...research.warnings,
        ...formatted.warnings,
        "Used two-pass --json + web (research then JSON format) to avoid json_object+tools failures.",
      ],
      usage: mergeUsage([research.usage, formatted.usage]),
    };
    return attachXSignal(normalizeResult(merged, options, mode, web, deprecatedWarnings), xSignal);
  }

  if (!options.json) {
    const webStatus = web.searchEnabled ? " (web search enabled)" : "";
    const xStatus = xMarkdown ? " + X signal" : "";
    console.error(`Step 1/1: Calling ${modelAlias} model${webStatus}${xStatus}...`);
  }
  const result = await caller({
    role,
    model,
    messages: buildSingleCallMessages(options.prompt, options.outputFormat, options.json, web.searchEnabled, xMarkdown),
    temperature: 0.2,
    json: options.json,
    web,
  });
  return attachXSignal(normalizeResult(result, options, mode, web, deprecatedWarnings), xSignal);
}

function withXInSchemaPrompt(prompt: string, xMarkdown?: string): string {
  if (!xMarkdown?.trim()) return prompt;
  return `${prompt}\n\nLive X/Twitter sample (for context):\n${xMarkdown.trim()}`;
}

function attachXSignal(result: PipelineResult, xSignal: XSignalResult | undefined): PipelineResult {
  if (!xSignal) return result;
  return {
    ...result,
    xSignal,
    warnings: dedupeWarnings([...result.warnings, ...xSignal.warnings]),
  };
}

function buildXOnlyResult(
  options: CliOptions,
  mode: CanonicalMode,
  _web: ResolvedWebOptions,
  extraWarnings: string[],
  xSignal: XSignalResult | undefined,
): PipelineResult {
  if (!xSignal) {
    throw new Error("--x-only requires a successful X signal from the Grok agent.");
  }

  const reportLine = xSignal.reportPath ? `\n\n**HTML report:** ${xSignal.reportPath}` : "";
  const content = `# X Signal Brief\n\n${xSignal.markdown.trim()}${reportLine}`;

  return {
    mode,
    profile: options.profile,
    outputFormat: options.outputFormat,
    content,
    sources: [],
    warnings: dedupeWarnings([...extraWarnings, ...xSignal.warnings]),
    usage: emptyUsage(),
    web: { searchEnabled: false, fetchEnabled: false },
    xSignal,
  };
}

async function runRetrieve(
  config: AppConfig,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  warnings: string[],
  caller: ModeCaller,
  xMarkdown?: string,
): Promise<PipelineResult> {
  const model = resolveModel(config, options.profile, mode === "fast" ? "fast" : "expert");
  if (!options.json) console.error(`Step 1/1: Retrieving web results (${model})...`);

  const result = await caller({
    role: "retrieve",
    model,
    messages: buildRetrieveMessages(options.prompt),
    temperature: 0.1,
    json: true,
    web,
  });

  const parsed = parseRetrieveContent(result.content);
  const searchResults = mergeRetrieveResults(parsed, result.sources);

  // --output both: also run a synthesis call over the retrieved results.
  let synthesis: PipelineResult | undefined;
  if (options.outputStyle === "both") {
    if (!options.json) console.error("Step 2/2: Synthesizing brief from retrieved results...");
    const sourcesBlock = searchResults
      .map((r) => `- ${r.title ? `${r.title}: ` : ""}${r.url}${r.content ? `\n  ${r.content}` : ""}`)
      .join("\n");
    const synthUser = xMarkdown
      ? `Query:\n${options.prompt}\n\nRetrieved sources:\n${sourcesBlock}\n\nLive X/Twitter sample:\n${xMarkdown}\n\nSynthesize the answer (include ## X signal if relevant).`
      : `Query:\n${options.prompt}\n\nRetrieved sources:\n${sourcesBlock}\n\nSynthesize the answer.`;
    synthesis = await caller({
      role: "synthesis",
      model,
      messages: [
        { role: "system", content: "Write a concise Markdown decision brief grounded in the provided sources. Cite URLs inline." },
        { role: "user", content: synthUser },
      ],
      temperature: 0.2,
      // Web is intentionally off: grounding is already in the retrieved sources block.
      // Re-enabling web would add cost and latency for no new information.
    });
  }

  const merged = synthesis
    ? {
        ...result,
        content: synthesis.content,
        usage: mergeUsage([result.usage, synthesis.usage]),
        sources: [...result.sources, ...synthesis.sources],
        warnings: [...result.warnings, ...synthesis.warnings],
      }
    : result;

  return normalizeRetrieveResult(merged, options, mode, web, warnings, searchResults, parsed.answer);
}

function normalizeRetrieveResult(
  result: PipelineResult,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  extraWarnings: string[],
  searchResults: SearchResult[],
  answer: string | undefined,
): PipelineResult {
  const { answer: _dropAnswer, ...resultWithoutAnswer } = result;
  const normalized: PipelineResult = {
    ...resultWithoutAnswer,
    mode,
    profile: options.profile,
    outputFormat: options.outputFormat,
    warnings: dedupeWarnings([...extraWarnings, ...result.warnings]),
    searchResults,
    ...(modeAllowsWeb(mode)
      ? { web: { searchEnabled: web.searchEnabled, fetchEnabled: web.fetchEnabled } }
      : { web: { searchEnabled: false, fetchEnabled: false } }),
  };

  // --output results: the content body is the optional LLM answer (if the model
  // returned one), otherwise empty. --output both already has the synthesis in
  // content from the merged result above; --output brief keeps the raw retrieve
  // JSON (the caller is expected to read search_results).
  if (options.outputStyle === "results" && answer) {
    normalized.content = answer;
  } else if (options.outputStyle === "results") {
    normalized.content = "";
  }

  return normalized;
}

function normalizeSchemaResult(
  result: PipelineResult,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  extraWarnings: string[],
): PipelineResult {
  let schemaResult: unknown;
  let parseWarning: string | undefined;
  try {
    schemaResult = JSON.parse(result.content);
  } catch {
    schemaResult = undefined;
    parseWarning = "--schema output was not valid JSON; schema_result is omitted. The raw model text is in content.";
  }

  const { answer: _dropSchemaAnswer, ...resultWithoutAnswer } = result;
  const warnings = parseWarning ? [...extraWarnings, ...result.warnings, parseWarning] : [...extraWarnings, ...result.warnings];
  const normalized: PipelineResult = {
    ...resultWithoutAnswer,
    mode,
    profile: options.profile,
    outputFormat: options.outputFormat,
    warnings: dedupeWarnings(warnings),
    ...(schemaResult !== undefined ? { schemaResult } : {}),
    ...(modeAllowsWeb(mode)
      ? { web: { searchEnabled: web.searchEnabled, fetchEnabled: web.fetchEnabled } }
      : { web: { searchEnabled: false, fetchEnabled: false } }),
  };
  return normalized;
}

function loadSchema(source: string): string {
  // Inline JSON if it parses, otherwise treat as a file path.
  try {
    JSON.parse(source);
    return source;
  } catch {
    // fall through to file read
  }
  try {
    return readFileSync(resolvePath(source), "utf8");
  } catch (error) {
    throw new Error(`Could not load --schema from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runMulti(
  config: AppConfig,
  options: CliOptions,
  mode: CanonicalMode,
  web: ResolvedWebOptions,
  warnings: string[],
  caller: ModeCaller,
  xMarkdown?: string,
): Promise<PipelineResult> {
  const researchModel = resolveModel(config, options.profile, "research");
  const expertModel = resolveModel(config, options.profile, "expert");

  if (!options.json) console.error("Step 1/3: Researching grounded facts...");
  const research = await caller({
    role: "research",
    model: researchModel,
    messages: buildResearchMessages(options.prompt, "report", false, xMarkdown),
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
      xMarkdown,
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

  if (options.json && options.schema === undefined && options.outputStyle === "brief" && !options.retrieve && mode !== "retrieve") {
    const parsed = parseDecisionAnswer(result.content);
    if (parsed.answer) {
      normalized.answer = parsed.answer;
    } else if (parsed.warning) {
      normalized.warnings = dedupeWarnings([...normalized.warnings, parsed.warning]);
    }
  }

  return normalized;
}

/** Parse DecisionAnswer JSON; reject non-objects (e.g. model returned "-1.5e-05"). */
export function parseDecisionAnswer(content: string): { answer?: DecisionAnswer; warning?: string } {
  const stripped = stripJsonFences(content).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return {
      warning: `Model returned non-JSON content for --json (${previewContent(content)}); answer fields omitted.`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      warning: `Model returned JSON that is not a decision object (got ${describeJsonType(parsed)}); answer fields omitted. content=${previewContent(content)}`,
    };
  }

  const record = parsed as Partial<{
    recommendation: unknown;
    key_facts: unknown;
    tradeoffs: unknown;
    risks: unknown;
    open_questions: unknown;
    confidence: unknown;
  }>;

  const answer: DecisionAnswer = {
    recommendation: stringValue(record.recommendation),
    keyFacts: stringArray(record.key_facts),
    tradeoffs: stringArray(record.tradeoffs),
    risks: stringArray(record.risks),
    openQuestions: stringArray(record.open_questions),
    confidence: record.confidence === "low" || record.confidence === "high" ? record.confidence : "medium",
  };

  // Empty recommendation + empty lists → likely garbage/minimal JSON
  if (!answer.recommendation && answer.keyFacts.length === 0 && answer.tradeoffs.length === 0) {
    return {
      warning: `Model returned an empty or invalid decision JSON object; answer fields omitted. content=${previewContent(content)}`,
    };
  }

  return { answer };
}

function stripJsonFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ? fenced[1].trim() : content;
}

function previewContent(content: string, max = 80): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? JSON.stringify(oneLine) : JSON.stringify(`${oneLine.slice(0, max)}…`);
}

function describeJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
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
